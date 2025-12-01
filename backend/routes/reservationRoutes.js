const express = require('express');
const { z } = require('zod');
const { authMiddleware } = require('../utils');
const validate = require('../middleware/validate');

// Schema definitions
const reservationSchema = z.object({
  parkingId: z.string().min(1),
  startTime: z.number().int().positive(), // epoch ms
  duration: z.number().int().min(15).max(24 * 60), // minutes
});

module.exports = function buildReservationRouter(JWT_SECRET, createReservationReminders) {
  const router = express.Router();
  const MAX_ADVANCE_DAYS = parseInt(process.env.RESERVATION_MAX_DAYS || '30');
  const MAX_ADVANCE_MS = MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000;

  // Create reservation
  router.post('/reservations', authMiddleware(JWT_SECRET), validate(reservationSchema), async (req, res) => {
    const { parkingId, startTime, duration } = req.validatedBody;
    const now = Date.now();

    // Time constraints (extended configurable logic)
    if (startTime < now || startTime > now + MAX_ADVANCE_MS) {
      return res.status(400).json({ error: `Invalid reservation time (max ${MAX_ADVANCE_DAYS}d advance)` });
    }

    try {
      const { getDb, saveDb } = require('../db');
      const db = getDb();
      const id = 'res' + Date.now() + Math.random().toString(36).slice(2, 6);
      const endTime = startTime + duration * 60 * 1000;
      // Simple pricing demo ($2.5 per hour)
      const amount = (duration / 60) * 2.5;
      const spotNumber = Math.floor(Math.random() * 50) + 1;
      const stmt = db.prepare(`INSERT INTO reservations (id, userId, parkingId, spotNumber, startTime, endTime, status, amount, createdAt) VALUES (?,?,?,?,?,?,?,?,?)`);
      stmt.bind([id, req.userId, parkingId, spotNumber, startTime, endTime, 'confirmed', amount, now]);
      stmt.step();
      stmt.free();

      await createReservationReminders(id, req.userId, { parkingId, spotNumber, startTime, endTime, duration }, db);
      saveDb();

      // QR code data for reservation
      const qrData = JSON.stringify({
        reservationId: id,
        parkingId,
        userId: req.userId,
        spotNumber,
        startTime,
        endTime
      });

      res.json({ id, startTime, endTime, amount, status: 'confirmed', qrData });
    } catch (e) {
      console.error('[reservation:create] error', e);
      res.status(500).json({ error: 'Failed to create reservation' });
    }
  });

  // Create Stripe checkout session for reservation
  const checkoutSchema = z.object({
    parkingId: z.string().min(1),
    startTime: z.number().int().positive(),
    duration: z.number().int().min(15).max(24 * 60),
    amount: z.number().positive(),
    parkingName: z.string().min(1)
  });

  router.post('/reservations/checkout', authMiddleware(JWT_SECRET), validate(checkoutSchema), async (req, res) => {
    const { parkingId, startTime, duration, amount, parkingName } = req.validatedBody;
    const now = Date.now();

    // Validate time constraints
    if (startTime < now || startTime > now + MAX_ADVANCE_MS) {
      return res.status(400).json({ error: `Invalid reservation time (max ${MAX_ADVANCE_DAYS}d advance)` });
    }

    try {
      const { findUserById } = require('../parkmaprdUserStore');
      const { getDb, saveDb } = require('../db');
      const db = getDb();

      const user = findUserById(req.userId);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

      // Create pending reservation
      const reservationId = 'res' + Date.now() + Math.random().toString(36).slice(2, 6);
      const endTime = startTime + duration * 60 * 1000;
      const spotNumber = Math.floor(Math.random() * 50) + 1;

      const stmt = db.prepare(`INSERT INTO reservations (id, userId, parkingId, spotNumber, startTime, endTime, status, amount, createdAt) VALUES (?,?,?,?,?,?,?,?,?)`);
      stmt.bind([reservationId, req.userId, parkingId, spotNumber, startTime, endTime, 'pending', amount, now]);
      stmt.step();
      stmt.free();

      // Create payment record
      const paymentId = 'pay_res_' + Date.now();
      const payStmt = db.prepare(`INSERT INTO payments (id, userId, parkingId, reservationId, amount, status, createdAt) VALUES (?,?,?,?,?,?,?)`);
      payStmt.bind([paymentId, req.userId, parkingId, reservationId, amount, 'pending', now]);
      payStmt.step();
      payStmt.free();
      saveDb();

      // Siempre modo mock: Pago simulado (sin Stripe)
      // Detectar el puerto del frontend desde el header Origin o Referer
      const origin = req.headers.origin || req.headers.referer || '';
      let frontendUrl = origin.replace(/\/$/, ''); // remover trailing slash
      if (!frontendUrl || frontendUrl === 'null') {
        frontendUrl = `http://localhost:${process.env.FRONTEND_PORT || '3002'}`;
      }
      const mockUrl = `${frontendUrl}/payment-success?session_id=mock_${paymentId}&type=reservation&reservationId=${reservationId}`;
      console.log('[MOCK MODE] Pago simulado para reserva:', reservationId, 'redirect:', mockUrl);
      res.json({
        sessionId: 'mock_' + paymentId,
        url: mockUrl,
        reservationId,
        paymentId,
        devMode: true
      });
    } catch (e) {
      console.error('[reservation:checkout] error', e);
      res.status(500).json({ error: 'Error al procesar pago: ' + e.message });
    }
  });

  // Endpoint para confirmar pago simulado (solo desarrollo)
  router.post('/reservations/:id/confirm-mock', authMiddleware(JWT_SECRET), async (req, res) => {
    const { id } = req.params;
    
    try {
      const { getDb, saveDb } = require('../db');
      const db = getDb();

      // Verificar que la reserva existe y pertenece al usuario
      const checkStmt = db.prepare('SELECT * FROM reservations WHERE id = ? AND userId = ?');
      checkStmt.bind([id, req.userId]);
      if (!checkStmt.step()) {
        checkStmt.free();
        return res.status(404).json({ error: 'Reserva no encontrada' });
      }
      const reservation = checkStmt.getAsObject();
      checkStmt.free();

      // Actualizar estado de reserva a confirmada
      const updateStmt = db.prepare('UPDATE reservations SET status = ? WHERE id = ?');
      updateStmt.bind(['confirmed', id]);
      updateStmt.step();
      updateStmt.free();

      // Actualizar estado de pago
      const paymentStmt = db.prepare('UPDATE payments SET status = ? WHERE reservationId = ?');
      paymentStmt.bind(['completed', id]);
      paymentStmt.step();
      paymentStmt.free();

      // Crear recordatorios
      await createReservationReminders(id, req.userId, {
        parkingId: reservation.parkingId,
        spotNumber: reservation.spotNumber,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        duration: (reservation.endTime - reservation.startTime) / (60 * 1000)
      }, db);

      saveDb();
      console.log('[DEV MODE] Reserva confirmada:', id);
      
      res.json({ success: true, reservationId: id, status: 'confirmed' });
    } catch (e) {
      console.error('[reservation:confirm-mock] error', e);
      res.status(500).json({ error: 'Error al confirmar reserva' });
    }
  });

  // List my reservations
  router.get('/users/me/reservations', authMiddleware(JWT_SECRET), (req, res) => {
    try {
      const { getDb } = require('../db');
      const db = getDb();
      const stmt = db.prepare('SELECT * FROM reservations WHERE userId = ? ORDER BY startTime DESC');
      stmt.bind([req.userId]);
      const reservations = [];
      while (stmt.step()) {
        const r = stmt.getAsObject();
        // Generar el QR para cada reserva
        r.qrData = JSON.stringify({
          reservationId: r.id,
          parkingId: r.parkingId,
          userId: r.userId,
          spotNumber: r.spotNumber,
          startTime: r.startTime,
          endTime: r.endTime
        });
        reservations.push(r);
      }
      stmt.free();
      res.json(reservations);
    } catch (e) {
      console.error('[reservation:list] error', e);
      res.status(500).json({ error: 'Failed to list reservations' });
    }
  });

  // Verificar reserva (para escáner QR)
  router.post('/reservations/verify', authMiddleware(JWT_SECRET), async (req, res) => {
    const { reservationId, qrData } = req.body;
    
    if (!reservationId) {
      return res.status(400).json({ error: 'Se requiere ID de reserva' });
    }

    try {
      const { getDb } = require('../db');
      const db = getDb();
      
      const stmt = db.prepare('SELECT * FROM reservations WHERE id = ?');
      stmt.bind([reservationId]);
      
      if (!stmt.step()) {
        stmt.free();
        return res.status(404).json({ error: 'Reserva no encontrada' });
      }
      
      const reservation = stmt.getAsObject();
      stmt.free();
      
      // Verificar si la reserva es válida
      const now = Date.now();
      const startTime = reservation.startTime;
      const endTime = reservation.endTime;
      
      // Permitir entrada 30 minutos antes
      const earlyEntryWindow = 30 * 60 * 1000;
      
      if (now < startTime - earlyEntryWindow) {
        return res.json({
          reservation,
          valid: true,
          message: `⏰ Reserva válida. Entrada permitida desde ${new Date(startTime - earlyEntryWindow).toLocaleTimeString()}`
        });
      }
      
      if (now > endTime) {
        return res.json({
          reservation,
          valid: false,
          message: '⚠️ Esta reserva ya expiró'
        });
      }
      
      res.json({
        reservation,
        valid: true,
        message: '✅ Reserva válida - Puede ingresar'
      });
    } catch (e) {
      console.error('[reservation:verify] error', e);
      res.status(500).json({ error: 'Error al verificar reserva' });
    }
  });

  // Registrar entrada (check-in)
  router.post('/reservations/:id/check-in', authMiddleware(JWT_SECRET), async (req, res) => {
    const { id } = req.params;
    
    try {
      const { getDb, saveDb } = require('../db');
      const db = getDb();
      
      // Verificar que existe la reserva
      const checkStmt = db.prepare('SELECT * FROM reservations WHERE id = ?');
      checkStmt.bind([id]);
      if (!checkStmt.step()) {
        checkStmt.free();
        return res.status(404).json({ error: 'Reserva no encontrada' });
      }
      const reservation = checkStmt.getAsObject();
      checkStmt.free();
      
      if (reservation.status === 'checked_in') {
        return res.status(400).json({ error: 'Ya se registró entrada para esta reserva' });
      }
      
      if (reservation.status === 'completed') {
        return res.status(400).json({ error: 'Esta reserva ya fue completada' });
      }
      
      // Actualizar estado
      const updateStmt = db.prepare('UPDATE reservations SET status = ?, checkInTime = ? WHERE id = ?');
      updateStmt.bind(['checked_in', Date.now(), id]);
      updateStmt.step();
      updateStmt.free();
      saveDb();
      
      console.log('[CHECK-IN] Reserva:', id);
      res.json({ success: true, message: '✅ Entrada registrada', reservationId: id });
    } catch (e) {
      console.error('[reservation:check-in] error', e);
      res.status(500).json({ error: 'Error al registrar entrada' });
    }
  });

  // Registrar salida (check-out)
  router.post('/reservations/:id/check-out', authMiddleware(JWT_SECRET), async (req, res) => {
    const { id } = req.params;
    
    try {
      const { getDb, saveDb } = require('../db');
      const db = getDb();
      
      // Verificar que existe la reserva
      const checkStmt = db.prepare('SELECT * FROM reservations WHERE id = ?');
      checkStmt.bind([id]);
      if (!checkStmt.step()) {
        checkStmt.free();
        return res.status(404).json({ error: 'Reserva no encontrada' });
      }
      const reservation = checkStmt.getAsObject();
      checkStmt.free();
      
      if (reservation.status === 'completed') {
        return res.status(400).json({ error: 'Esta reserva ya fue completada' });
      }
      
      // Actualizar estado
      const updateStmt = db.prepare('UPDATE reservations SET status = ?, checkOutTime = ? WHERE id = ?');
      updateStmt.bind(['completed', Date.now(), id]);
      updateStmt.step();
      updateStmt.free();
      saveDb();
      
      console.log('[CHECK-OUT] Reserva:', id);
      res.json({ success: true, message: '✅ Salida registrada', reservationId: id });
    } catch (e) {
      console.error('[reservation:check-out] error', e);
      res.status(500).json({ error: 'Error al registrar salida' });
    }
  });

  return router;
}
