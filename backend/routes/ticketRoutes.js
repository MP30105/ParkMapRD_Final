const express = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { authMiddleware } = require('../utils');
const {
  findUserById,
  addTicket,
  updateTicket
} = require('../parkmaprdUserStore');

module.exports = function buildTicketRouter(JWT_SECRET, parkingStore) {
  const router = express.Router();
  // Verificar ticket por QR
  router.post('/tickets/verify', authMiddleware(JWT_SECRET), (req, res) => {
    const { ticketId, parkingId, userId, spotNumber } = req.body;
    if (!ticketId || !parkingId || !userId) {
      return res.status(400).json({ error: 'Datos de QR incompletos' });
    }
    const user = findUserById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const ticket = (user.tickets || []).find(t => t.id === ticketId && t.parkingId === parkingId && t.spotNumber === spotNumber);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado o inválido' });
    if (ticket.status !== 'active') return res.status(400).json({ error: 'Ticket no está activo' });
    // Registrar entrada/salida
    updateTicket(userId, ticketId, { status: 'used', usedAt: Date.now() });
    const p = parkingStore.getById(parkingId);
    if (p) parkingStore.updateAvailability(p.id, Math.min(p.totalSpots, p.availableSpots + 1));
    res.json({ ok: true, userId, ticketId, parkingId, spotNumber, usedAt: Date.now() });
  });
  const bookingSchema = z.object({
    parkingId: z.string().min(1),
    carId: z.string().min(1),
    durationMinutes: z.number().int().min(1),
    zone: z.string().optional()
  });

  // Create booking (ticket active)
  router.post('/bookings', authMiddleware(JWT_SECRET), validate(bookingSchema), (req, res) => {
    const { parkingId, carId, durationMinutes, zone } = req.validatedBody;
    const parking = parkingStore.getById(parkingId);
    if (!parking) return res.status(404).json({ error: 'parking not found' });
    if (parking.availableSpots <= 0) return res.status(400).json({ error: 'no spots available' });
    const spotNumber = Math.floor(Math.random() * parking.totalSpots) + 1;
    const startTime = Date.now();
    const endTime = startTime + durationMinutes * 60 * 1000;
    const ticket = {
      id: 't' + Date.now(),
      parkingId,
      userId: req.userId,
      carId,
      zone: zone || null,
      spotNumber,
      startTime,
      endTime,
      status: 'active'
    };
    addTicket(req.userId, ticket);
    parkingStore.updateAvailability(parkingId, Math.max(0, parking.availableSpots - 1));
    res.json(ticket);
  });

  // List user tickets
  router.get('/users/me/tickets', authMiddleware(JWT_SECRET), (req, res) => {
    const user = findUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'user not found' });
    const active = (user.tickets || []).filter(t => t.status === 'active');
    const previous = (user.tickets || []).filter(t => t.status !== 'active');
    res.json({ active, previous });
  });

  // Use ticket
  router.post('/tickets/:id/use', authMiddleware(JWT_SECRET), (req, res) => {
    const ticketId = req.params.id;
    const user = findUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'user not found' });
    const ticket = (user.tickets || []).find(t => t.id === ticketId);
    if (!ticket) return res.status(404).json({ error: 'ticket not found' });
    if (ticket.status !== 'active') return res.status(400).json({ error: 'ticket not active' });
    updateTicket(req.userId, ticketId, { status: 'used', usedAt: Date.now() });
    const p = parkingStore.getById(ticket.parkingId);
    if (p) parkingStore.updateAvailability(p.id, Math.min(p.totalSpots, p.availableSpots + 1));
    res.json({ ok: true });
  });

  // Extend ticket
  router.post('/tickets/:id/extend', authMiddleware(JWT_SECRET), validate(z.object({ minutes: z.number().int().min(15).max(240) })), (req, res) => {
    // For now delegate to legacy endpoint kept in main server (avoid duplication)
    return res.status(501).json({ error: 'extend not yet migrated' });
  });

  return router;
};
