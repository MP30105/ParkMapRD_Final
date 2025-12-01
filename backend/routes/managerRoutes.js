const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db');
const { requireParkingManager, getManagerParkings, requireRoles } = require('../middleware/roles');
const { findUserById, updateUser } = require('../parkmaprdUserStore');

// ==================== ADMIN: Assign/Remove Managers ====================

// Get all parking managers (admin only)
router.get('/admin/managers', requireRoles(['admin', 'mainadmin', 'main']), (req, res) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT pm.*, u.username, u.email, u.name, p.name as parkingName
      FROM parking_managers pm
      JOIN users u ON pm.userId = u.id
      LEFT JOIN parkings p ON pm.parkingId = p.id
      WHERE pm.active = 1
      ORDER BY pm.assignedAt DESC
    `);
    const managers = stmt.all();
    res.json(managers);
  } catch (error) {
    console.error('Error fetching managers:', error);
    res.status(500).json({ error: 'Failed to fetch managers' });
  }
});

// Assign a manager to a parking (admin only)
router.post('/admin/assign', requireRoles(['admin', 'mainadmin', 'main']), (req, res) => {
  const { userId, parkingId } = req.body;
  
  if (!userId || !parkingId) {
    return res.status(400).json({ error: 'userId and parkingId are required' });
  }

  try {
    const db = getDatabase();
    
    // Verify user exists and update role if needed
    const user = findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user role to parking_manager if not already
    if (user.role !== 'parking_manager') {
      updateUser(userId, { role: 'parking_manager' });
    }

    // Verify parking exists
    const parkingStmt = db.prepare('SELECT id, name FROM parkings WHERE id = ?');
    const parking = parkingStmt.get(parkingId);
    if (!parking) {
      return res.status(404).json({ error: 'Parking not found' });
    }

    // Check if assignment already exists
    const checkStmt = db.prepare('SELECT id, active FROM parking_managers WHERE userId = ? AND parkingId = ?');
    const existing = checkStmt.get(userId, parkingId);

    if (existing) {
      if (existing.active) {
        return res.status(400).json({ error: 'Manager already assigned to this parking' });
      }
      // Reactivate if was inactive
      const reactivateStmt = db.prepare('UPDATE parking_managers SET active = 1, assignedAt = ?, assignedBy = ? WHERE id = ?');
      reactivateStmt.run(Math.floor(Date.now() / 1000), req.userId, existing.id);
      return res.json({ 
        message: 'Manager assignment reactivated',
        id: existing.id,
        userId,
        parkingId,
        parkingName: parking.name
      });
    }

    // Create new assignment
    const id = uuidv4();
    const insertStmt = db.prepare(`
      INSERT INTO parking_managers (id, userId, parkingId, assignedBy, assignedAt, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    insertStmt.run(id, userId, parkingId, req.userId, Math.floor(Date.now() / 1000));

    res.json({ 
      message: 'Manager assigned successfully',
      id,
      userId,
      parkingId,
      parkingName: parking.name,
      userName: user.username || user.email
    });
  } catch (error) {
    console.error('Error assigning manager:', error);
    res.status(500).json({ error: 'Failed to assign manager' });
  }
});

// Remove a manager from a parking (admin only)
router.delete('/admin/assign/:assignmentId', requireRoles(['admin', 'mainadmin', 'main']), (req, res) => {
  const { assignmentId } = req.params;

  try {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE parking_managers SET active = 0 WHERE id = ?');
    const result = stmt.run(assignmentId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ message: 'Manager removed successfully' });
  } catch (error) {
    console.error('Error removing manager:', error);
    res.status(500).json({ error: 'Failed to remove manager' });
  }
});

// Get users eligible to be managers (admin only)
router.get('/admin/eligible-users', requireRoles(['admin', 'mainadmin', 'main']), (req, res) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT id, username, email, name, role
      FROM users
      WHERE role IN ('user', 'parking_manager')
      ORDER BY username
    `);
    const users = stmt.all();
    res.json(users);
  } catch (error) {
    console.error('Error fetching eligible users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Fix user role (admin only - for debugging)
router.post('/admin/fix-role/:userId', requireRoles(['admin', 'mainadmin', 'main']), (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    if (!role || !['parking_manager', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const updatedUser = updateUser(userId, { role });
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'Role updated successfully',
      user: { id: updatedUser.id, email: updatedUser.email, role: updatedUser.role }
    });
  } catch (error) {
    console.error('Error fixing user role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ==================== MANAGER: View Assigned Parkings ====================

// Get parkings assigned to the manager
router.get('/my-parkings', requireParkingManager, (req, res) => {
  try {
    if (req.canAccessAllParkings) {
      // Admin sees all parkings
      const db = getDatabase();
      const stmt = db.prepare('SELECT * FROM parkings ORDER BY name');
      const parkings = stmt.all();
      return res.json(parkings);
    }

    // Regular manager sees only assigned parkings
    const parkingIds = getManagerParkings(req.userId);
    if (parkingIds.length === 0) {
      return res.json([]);
    }

    const db = getDatabase();
    const placeholders = parkingIds.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT * FROM parkings WHERE id IN (${placeholders}) ORDER BY name`);
    const parkings = stmt.all(...parkingIds);
    
    res.json(parkings);
  } catch (error) {
    console.error('Error fetching manager parkings:', error);
    res.status(500).json({ error: 'Failed to fetch parkings' });
  }
});

// ==================== MANAGER: View Tickets & Reservations ====================

// Get active tickets for manager's parkings
router.get('/tickets', requireParkingManager, (req, res) => {
  try {
    const db = getDatabase();
    let tickets;

    if (req.canAccessAllParkings) {
      // Admin sees all tickets
      const stmt = db.prepare(`
        SELECT t.*, u.username, u.email, u.name as userName, p.name as parkingName
        FROM tickets t
        LEFT JOIN users u ON t.userId = u.id
        LEFT JOIN parkings p ON t.parkingId = p.id
        WHERE t.status = 'active'
        ORDER BY t.startTime DESC
      `);
      tickets = stmt.all();
    } else {
      // Manager sees only tickets for assigned parkings
      const parkingIds = getManagerParkings(req.userId);
      if (parkingIds.length === 0) {
        return res.json([]);
      }

      const placeholders = parkingIds.map(() => '?').join(',');
      const stmt = db.prepare(`
        SELECT t.*, u.username, u.email, u.name as userName, p.name as parkingName
        FROM tickets t
        LEFT JOIN users u ON t.userId = u.id
        LEFT JOIN parkings p ON t.parkingId = p.id
        WHERE t.parkingId IN (${placeholders}) AND t.status = 'active'
        ORDER BY t.startTime DESC
      `);
      tickets = stmt.all(...parkingIds);
    }

    res.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Get reservations for manager's parkings
router.get('/reservations', requireParkingManager, (req, res) => {
  try {
    const db = getDatabase();
    let reservations;

    if (req.canAccessAllParkings) {
      // Admin sees all reservations
      const stmt = db.prepare(`
        SELECT r.*, u.username, u.email, u.name as userName, p.name as parkingName
        FROM reservations r
        LEFT JOIN users u ON r.userId = u.id
        LEFT JOIN parkings p ON r.parkingId = p.id
        WHERE r.status IN ('pending', 'confirmed')
        ORDER BY r.startTime ASC
      `);
      reservations = stmt.all();
    } else {
      // Manager sees only reservations for assigned parkings
      const parkingIds = getManagerParkings(req.userId);
      if (parkingIds.length === 0) {
        return res.json([]);
      }

      const placeholders = parkingIds.map(() => '?').join(',');
      const stmt = db.prepare(`
        SELECT r.*, u.username, u.email, u.name as userName, p.name as parkingName
        FROM reservations r
        LEFT JOIN users u ON r.userId = u.id
        LEFT JOIN parkings p ON r.parkingId = p.id
        WHERE r.parkingId IN (${placeholders}) AND r.status IN ('pending', 'confirmed')
        ORDER BY r.startTime ASC
      `);
      reservations = stmt.all(...parkingIds);
    }

    res.json(reservations);
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

// Get ticket history for a specific parking (with date range)
router.get('/tickets/history/:parkingId', requireParkingManager, (req, res) => {
  const { parkingId } = req.params;
  const { startDate, endDate } = req.query;

  try {
    // Check access
    if (!req.canAccessAllParkings) {
      const allowedParkings = getManagerParkings(req.userId);
      if (!allowedParkings.includes(parkingId)) {
        return res.status(403).json({ error: 'Access denied to this parking' });
      }
    }

    const db = getDatabase();
    let query = `
      SELECT t.*, u.username, u.email, u.name as userName
      FROM tickets t
      LEFT JOIN users u ON t.userId = u.id
      WHERE t.parkingId = ?
    `;
    const params = [parkingId];

    if (startDate) {
      query += ` AND t.startTime >= ?`;
      params.push(parseInt(startDate));
    }
    if (endDate) {
      query += ` AND t.endTime <= ?`;
      params.push(parseInt(endDate));
    }

    query += ` ORDER BY t.startTime DESC LIMIT 100`;

    const stmt = db.prepare(query);
    const tickets = stmt.all(...params);

    res.json(tickets);
  } catch (error) {
    console.error('Error fetching ticket history:', error);
    res.status(500).json({ error: 'Failed to fetch ticket history' });
  }
});

// Get stats for manager's parkings
router.get('/stats', requireParkingManager, (req, res) => {
  try {
    const db = getDatabase();
    let parkingIds;

    if (req.canAccessAllParkings) {
      const stmt = db.prepare('SELECT id FROM parkings');
      parkingIds = stmt.all().map(p => p.id);
    } else {
      parkingIds = getManagerParkings(req.userId);
    }

    if (parkingIds.length === 0) {
      return res.json({ activeTickets: 0, pendingReservations: 0, totalRevenue: 0 });
    }

    const placeholders = parkingIds.map(() => '?').join(',');

    // Active tickets count
    const ticketsStmt = db.prepare(`SELECT COUNT(*) as count FROM tickets WHERE parkingId IN (${placeholders}) AND status = 'active'`);
    const activeTickets = ticketsStmt.get(...parkingIds).count;

    // Pending reservations
    const reservationsStmt = db.prepare(`SELECT COUNT(*) as count FROM reservations WHERE parkingId IN (${placeholders}) AND status IN ('pending', 'confirmed')`);
    const pendingReservations = reservationsStmt.get(...parkingIds).count;

    // Total revenue (last 30 days) - using hourlyRate as approximation since tickets don't have amount
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    const revenueStmt = db.prepare(`SELECT COUNT(*) as ticketCount FROM tickets WHERE parkingId IN (${placeholders}) AND startTime >= ?`);
    const ticketCount = revenueStmt.get(...parkingIds, thirtyDaysAgo)?.ticketCount || 0;
    const totalRevenue = ticketCount * 100; // Approximation using default hourly rate

    res.json({
      activeTickets,
      pendingReservations,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      managedParkings: parkingIds.length
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
