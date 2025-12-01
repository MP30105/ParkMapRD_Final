const express = require('express');
const { check, validationResult } = require('express-validator');

module.exports = function buildParkingRouter(parkingStore, { CAMERA_TOKEN }) {
  const router = express.Router();

  // List all parkings
    // List all parkings with optional pagination
    router.get('/', (req, res) => {
      let { limit = 100, offset = 0 } = req.query;
      limit = Math.max(1, Math.min(Number(limit), 500)); // Clamp limit between 1 and 500
      offset = Math.max(0, Number(offset));
      const all = parkingStore.getAll();
      const paged = all.slice(offset, offset + limit);
      res.json({
        total: all.length,
        limit,
        offset,
        results: paged
      });
    });

  // Get parking by id
  router.get('/:id', (req, res) => {
    const p = parkingStore.getById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p);
  });

  // Update availability (camera authorized)
  router.post('/:id/availability', [
    check('availableSpots').isInt({ min: 0 }).withMessage('availableSpots must be integer >= 0')
  ], (req, res) => {
    const { authorization } = req.headers;
    if (!authorization || authorization !== `Bearer ${CAMERA_TOKEN}`) {
      return res.status(401).json({ error: 'unauthorized camera' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { availableSpots } = req.body;
    const updated = parkingStore.updateAvailability(req.params.id, availableSpots);
    if (!updated) return res.status(404).json({ error: 'Parking not found' });

    // Broadcast update if available
    const app = req.app;
    if (app.locals.broadcast) {
      app.locals.broadcast({
        type: 'parking_update',
        parkingId: req.params.id,
        availableSpots: updated.availableSpots,
        totalSpots: updated.totalSpots
      });
    }
    res.json(updated);
  });

  // Nearest parking with availability
  router.get('/nearest/query', (req, res) => {
    const { lat, lng } = req.query;
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
      return res.status(400).json({ error: 'lat/lng required' });
    }
    const all = parkingStore.getAll();
    const withSpots = all.filter(p => p.availableSpots > 0);
    if (withSpots.length === 0) return res.status(404).json({ error: 'No parking available' });
    function dist(aLat, aLng, bLat, bLng) {
      return Math.sqrt(Math.pow(aLat - bLat, 2) + Math.pow(aLng - bLng, 2));
    }
    const nearest = withSpots.sort((a, b) => dist(userLat, userLng, a.lat, a.lng) - dist(userLat, userLng, b.lat, b.lng))[0];
    res.json(nearest);
  });

  return router;
};
