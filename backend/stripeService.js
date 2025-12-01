const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Create checkout session for ticket payment or reservation
async function createCheckoutSession(ticketData, userId) {
  const isReservation = ticketData.metadata && ticketData.metadata.type === 'reservation';
  const description = isReservation 
    ? `Reserva para ${new Date(parseInt(ticketData.metadata.startTime)).toLocaleDateString()}`
    : `Zona ${ticketData.zone}, Espacio #${ticketData.spotNumber}`;
  
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: ticketData.userEmail,
    client_reference_id: userId,
    line_items: [
      {
        price_data: {
          currency: 'dop',
          product_data: {
            name: `${isReservation ? 'Reserva' : 'Estacionamiento'} - ${ticketData.parkingName}`,
            description,
            images: ['https://via.placeholder.com/300x200?text=Parking'],
          },
          unit_amount: Math.round(ticketData.amount * 100), // Convert to cents
        },
        quantity: 1,
      },
    ],
    metadata: {
      ...(ticketData.metadata || {}),
      ticketId: ticketData.ticketId,
      reservationId: ticketData.reservationId,
      userId: userId,
      parkingId: ticketData.parkingId,
      type: isReservation ? 'reservation' : 'ticket'
    },
    success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&type=${isReservation ? 'reservation' : 'ticket'}`,
    cancel_url: `${process.env.FRONTEND_URL}/payment-cancelled`,
  });

  return session;
}

// Create payment intent for wallet recharge
async function createWalletRechargeIntent(amount, userId, userEmail) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to centavos
    currency: 'dop',
    metadata: {
      type: 'wallet_recharge',
      userId: userId,
    },
    receipt_email: userEmail,
  });

  return paymentIntent;
}

// Create or retrieve Stripe customer
async function createOrGetCustomer(userEmail, userId, userName) {
  // Search for existing customer
  const customers = await stripe.customers.list({
    email: userEmail,
    limit: 1,
  });

  if (customers.data.length > 0) {
    return customers.data[0];
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email: userEmail,
    name: userName,
    metadata: {
      userId: userId,
    },
  });

  return customer;
}

// Retrieve payment intent
async function retrievePaymentIntent(paymentIntentId) {
  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

// Retrieve checkout session
async function retrieveCheckoutSession(sessionId) {
  return await stripe.checkout.sessions.retrieve(sessionId);
}

// Create refund
async function createRefund(paymentIntentId, amount) {
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amount ? Math.round(amount * 100) : undefined, // Partial or full refund
  });

  return refund;
}

// Verify webhook signature
function verifyWebhookSignature(payload, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    return event;
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return null;
  }
}

// Handle successful payment
async function handlePaymentSuccess(session, db) {
  const { ticketId, userId, parkingId } = session.metadata;
  
  // Update payment record
  db.run(
    `UPDATE payments SET 
      status = 'completed',
      stripePaymentIntentId = ?,
      receiptUrl = ?
    WHERE id = (SELECT id FROM payments WHERE ticketId = ? AND status = 'pending')`,
    [session.payment_intent, session.receipt_url, ticketId]
  );

  // Activate ticket
  db.run(
    `UPDATE tickets SET status = 'active' WHERE id = ?`,
    [ticketId]
  );

  // Create automatic reminders based on user preferences
  await createTicketReminders(ticketId, userId, db);

  return { success: true };
}

// Create automatic reminders for a ticket
async function createTicketReminders(ticketId, userId, db) {
  try {
    // Get user preferences
    const prefsStmt = db.prepare('SELECT * FROM reminder_preferences WHERE userId = ?');
    prefsStmt.bind([userId]);
    const hasPrefs = prefsStmt.step();
    let preferences = hasPrefs ? prefsStmt.getAsObject() : null;
    prefsStmt.free();
    
    // If no preferences, create default ones
    if (!preferences) {
      const insertPrefStmt = db.prepare(`
        INSERT INTO reminder_preferences 
        (userId, emailEnabled, pushEnabled, reminderTimes) 
        VALUES (?, 1, 1, '[30,5]')`);
      
      insertPrefStmt.bind([userId]);
      insertPrefStmt.step();
      insertPrefStmt.free();
      
      preferences = {
        emailEnabled: 1,
        pushEnabled: 1,
        reminderTimes: '[30,5]'
      };
    }
    
    // Only create reminders if user has enabled them
    if (!preferences.emailEnabled && !preferences.pushEnabled) return;
    
    // Get ticket details
    const ticketStmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
    ticketStmt.bind([ticketId]);
    const hasTicket = ticketStmt.step();
    if (!hasTicket) {
      ticketStmt.free();
      return;
    }
    const ticket = ticketStmt.getAsObject();
    ticketStmt.free();
    
    // Get parking details
    const parkingStmt = db.prepare('SELECT * FROM parkings WHERE id = ?');
    parkingStmt.bind([ticket.parkingId]);
    const hasParking = parkingStmt.step();
    const parking = hasParking ? parkingStmt.getAsObject() : { name: 'Unknown Parking' };
    if (hasParking) parkingStmt.free();
    
    // Calculate reminder times from user preferences
    const expirationTime = ticket.endTime;
    const reminderTimes = JSON.parse(preferences.reminderTimes || '[30,5]'); // minutes before expiration
    
    // Create multiple reminders based on user preferences
    const channels = [];
    if (preferences.emailEnabled) channels.push('email');
    if (preferences.pushEnabled) channels.push('app');
    
    for (const minutesBefore of reminderTimes) {
      const reminderTime = expirationTime - (minutesBefore * 60 * 1000);
      
      // Only create reminder if it's in the future
      if (reminderTime > Date.now()) {
        const reminderId = 'rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const reminderStmt = db.prepare(`
          INSERT INTO reminders 
          (id, userId, type, title, message, scheduledTime, relatedId, channels, createdAt) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        
        const title = `⚠️ Tu estacionamiento expira pronto`;
        const message = `Tu ticket en ${parking.name} (Zona ${ticket.zone}, Espacio #${ticket.spotNumber}) expira en ${minutesBefore} minutos.`;
        
        reminderStmt.bind([
          reminderId,
          userId,
          'expiration_warning',
          title,
          message,
          reminderTime,
          ticketId,
          JSON.stringify(channels),
          Date.now()
        ]);
        
        reminderStmt.step();
        reminderStmt.free();
      }
    }
    
    // Save changes
    const saveDb = require('./db').saveDb;
    saveDb();
    
  } catch (error) {
    console.error('Error creating ticket reminders:', error);
  }
}

module.exports = {
  createCheckoutSession,
  createWalletRechargeIntent,
  createOrGetCustomer,
  retrievePaymentIntent,
  retrieveCheckoutSession,
  createRefund,
  verifyWebhookSignature,
  handlePaymentSuccess,
  createTicketReminders,
};
