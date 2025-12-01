const express = require('express');
const bodyParser = require('body-parser');
const { z } = require('zod');
const { authMiddleware } = require('../utils');
const validate = require('../middleware/validate');

// Simple checkout schema (mock payment)
const checkoutSchema = z.object({
  parkingId: z.string().min(1),
  amount: z.number().positive()
});

module.exports = function buildPaymentRouter({ JWT_SECRET, parkingStore, stripeService, emailService, findUserById }) {
  const router = express.Router();

  // Mock payment checkout
  router.post('/payments/checkout', authMiddleware(JWT_SECRET), validate(checkoutSchema), (req, res) => {
    const { parkingId, amount } = req.validatedBody;
    const parking = parkingStore.getById(parkingId);
    if (!parking) return res.status(404).json({ error: 'parking not found' });
    const payment = {
      status: 'success',
      transactionId: 'txn_' + Date.now(),
      amount,
      parkingId,
      userId: req.userId
    };
    res.json(payment);
  });

  // Stripe webhook (raw body required)
  router.post('/webhooks/stripe', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    try {
      const event = stripeService.verifyWebhookSignature(req.body, sig);
      if (!event) return res.status(400).send('Webhook signature verification failed');

      const { getDb, saveDb } = require('../db');
      const db = getDb();

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          await stripeService.handlePaymentSuccess(session, db);
          const user = findUserById(session.metadata.userId);
          const parking = parkingStore.find(p => p.id === session.metadata.parkingId);
          
          // Check if it's a reservation payment
          if (session.metadata.type === 'reservation' && session.metadata.reservationId) {
            const reservationId = session.metadata.reservationId;
            // Update reservation status to confirmed
            const updateResStmt = db.prepare('UPDATE reservations SET status = ? WHERE id = ?');
            updateResStmt.bind(['confirmed', reservationId]);
            updateResStmt.step();
            updateResStmt.free();

            // Create reminders for the reservation
            if (user && parking) {
              const resStmt = db.prepare('SELECT * FROM reservations WHERE id = ?');
              resStmt.bind([reservationId]);
              if (resStmt.step()) {
                const reservation = resStmt.getAsObject();
                // Import createReservationReminders from server.js context
                try {
                  const createReservationReminders = require('../server').createReservationReminders;
                  if (createReservationReminders) {
                    await createReservationReminders(reservationId, user.id, {
                      parkingId: reservation.parkingId,
                      spotNumber: reservation.spotNumber,
                      startTime: reservation.startTime,
                      endTime: reservation.endTime,
                      duration: (reservation.endTime - reservation.startTime) / 60000
                    }, db);
                  }
                } catch (_) { /* reminders optional */ }
                
                // Send confirmation email
                emailService.sendPaymentReceipt(
                  user.email,
                  user.username,
                  {
                    parkingName: parking.name,
                    type: 'reservation',
                    spotNumber: reservation.spotNumber,
                    startTime: new Date(reservation.startTime).toLocaleString(),
                    duration: `${Math.round((reservation.endTime - reservation.startTime) / 60000)} minutos`
                  },
                  {
                    amount: session.amount_total / 100,
                    transactionId: session.payment_intent,
                    createdAt: Date.now()
                  }
                ).catch(err => console.error('Error sending receipt:', err));
              }
              resStmt.free();
            }
          } else if (user && parking) {
            // Handle ticket payment
            const ticketStmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
            ticketStmt.bind([session.metadata.ticketId]);
            const hasTicket = ticketStmt.step();
            if (hasTicket) {
              const ticket = ticketStmt.getAsObject();
              const duration = Math.round((ticket.endTime - ticket.startTime) / 60000);
              emailService.sendPaymentReceipt(
                user.email,
                user.username,
                {
                  parkingName: parking.name,
                  zone: ticket.zone,
                  spotNumber: ticket.spotNumber,
                  duration: `${duration} minutos`
                },
                {
                  amount: session.amount_total / 100,
                  transactionId: session.payment_intent,
                  createdAt: Date.now()
                }
              ).catch(err => console.error('Error sending receipt:', err));
            }
            ticketStmt.free();
          }
          saveDb();
          break;
        }
        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object;
          const updateStmt = db.prepare('UPDATE payments SET status = ? WHERE stripePaymentIntentId = ?');
          updateStmt.bind(['failed', paymentIntent.id]);
          updateStmt.step();
          updateStmt.free();
          saveDb();
          break;
        }
      }
      res.json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(400).send(`Webhook Error: ${error.message}`);
    }
  });

  // Payment status
  router.get('/payments/:id', authMiddleware(JWT_SECRET), (req, res) => {
    try {
      const { getDb } = require('../db');
      const db = getDb();
      const stmt = db.prepare('SELECT * FROM payments WHERE id = ? AND userId = ?');
      stmt.bind([req.params.id, req.userId]);
      const hasPayment = stmt.step();
      if (!hasPayment) {
        stmt.free();
        return res.status(404).json({ error: 'Pago no encontrado' });
      }
      const payment = stmt.getAsObject();
      stmt.free();
      res.json(payment);
    } catch (e) {
      console.error('[payments:status] error', e);
      res.status(500).json({ error: 'Error consultando pago' });
    }
  });

  return router;
};
