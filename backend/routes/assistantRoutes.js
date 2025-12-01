const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase, saveDb } = require('../db');
const { requireParkingManager, getManagerParkings, requireParkingAssistant, getAssistantParkings } = require('../middleware/roles');
const { findUserByUsername, findUserByEmail, createUser } = require('../parkmaprdUserStore');

// Manager creates a new assistant for their parking
router.post('/create', requireParkingManager, async (req, res) => {
  try {
    console.log('[ASSISTANT CREATE] Request body:', req.body);
    console.log('[ASSISTANT CREATE] User ID:', req.userId);
    console.log('[ASSISTANT CREATE] User role:', req.user?.role);
    console.log('[ASSISTANT CREATE] Can access all parkings:', req.canAccessAllParkings);
    
    const { username, email, password, name, parkingId } = req.body;
    
    if (!username || !email || !password || !name || !parkingId) {
      console.log('[ASSISTANT CREATE] Missing required fields');
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    
    // Verify manager has access to this parking
    if (!req.canAccessAllParkings) {
      const managerParkings = getManagerParkings(req.userId);
      console.log('[ASSISTANT CREATE] Manager parkings:', managerParkings);
      console.log('[ASSISTANT CREATE] Requested parking ID:', parkingId);
      if (!managerParkings.includes(parkingId)) {
        console.log('[ASSISTANT CREATE] Access denied to parking:', parkingId);
        return res.status(403).json({ error: 'No tienes acceso a este parqueo' });
      }
    }
    
    // Check if username or email already exists
    console.log('[ASSISTANT CREATE] Checking if username exists:', username);
    if (findUserByUsername(username)) {
      console.log('[ASSISTANT CREATE] Username already exists:', username);
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }
    console.log('[ASSISTANT CREATE] Checking if email exists:', email);
    if (findUserByEmail(email)) {
      console.log('[ASSISTANT CREATE] Email already exists:', email);
      return res.status(400).json({ error: 'El email ya existe' });
    }
    
    // Create user with parking_assistant role
    console.log('[ASSISTANT CREATE] Creating new user...');
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = createUser({
      email,
      username,
      passwordHash,
      name,
      role: 'parking_assistant'
    });
    console.log('[ASSISTANT CREATE] New user created:', newUser.id);
    
    // Create assistant assignment
    console.log('[ASSISTANT CREATE] Creating assistant assignment...');
    const db = getDatabase();
    const assistantId = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO parking_assistants (id, userId, parkingId, createdBy, createdAt, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    stmt.run(assistantId, newUser.id, parkingId, req.userId, Math.floor(Date.now() / 1000));
    saveDb();
    console.log('[ASSISTANT CREATE] Assistant assignment created successfully');
    
    res.json({ 
      success: true, 
      message: 'Asistente creado exitosamente',
      assistant: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        name: newUser.name
      }
    });
  } catch (error) {
    console.error('[ASSISTANT CREATE] Error creating assistant:', error);
    res.status(500).json({ error: 'Error al crear asistente' });
  }
});

// Assistant gets their assigned parkings
router.get('/my-parkings', requireParkingAssistant, (req, res) => {
  try {
    console.log('[MY-PARKINGS] User ID:', req.userId);
    console.log('[MY-PARKINGS] User role:', req.user?.role);
    console.log('[MY-PARKINGS] Can access all parkings:', req.canAccessAllParkings);
    
    const db = getDatabase();
    
    if (req.user.role === 'parking_assistant') {
      // Get assistant's parkings
      console.log('[MY-PARKINGS] Getting assistant parkings for user:', req.userId);
      const stmt = db.prepare(`
        SELECT pa.id, pa.parkingId, pa.createdAt,
               p.name as parkingName, p.totalSpots, p.availableSpots
        FROM parking_assistants pa
        JOIN parkings p ON pa.parkingId = p.id
        WHERE pa.userId = ? AND pa.active = 1
        ORDER BY pa.createdAt DESC
      `);
      const assistantParkings = stmt.all(req.userId);
      console.log('[MY-PARKINGS] Found assistant parkings:', assistantParkings.length);
      res.json(assistantParkings);
    } else if (req.user.role === 'parking_manager') {
      // Manager can see their managed parkings
      const managerParkings = getManagerParkings(req.userId);
      if (managerParkings.length === 0) {
        return res.json([]);
      }
      
      const placeholders = managerParkings.map(() => '?').join(',');
      const stmt = db.prepare(`
        SELECT id as parkingId, name as parkingName, totalSpots, availableSpots
        FROM parkings 
        WHERE id IN (${placeholders})
      `);
      const parkings = stmt.all(...managerParkings);
      res.json(parkings.map(p => ({ ...p, id: `manager-${p.parkingId}` })));
    } else {
      // Admin sees all parkings
      const stmt = db.prepare(`
        SELECT id as parkingId, name as parkingName, totalSpots, availableSpots
        FROM parkings
      `);
      const allParkings = stmt.all();
      res.json(allParkings.map(p => ({ ...p, id: `admin-${p.parkingId}` })));
    }
  } catch (error) {
    console.error('Error getting assistant parkings:', error);
    res.status(500).json({ error: 'Error al obtener parqueos asignados' });
  }
});

// Manager gets all their assistants
router.get('/my-assistants', requireParkingManager, (req, res) => {
  try {
    const db = getDatabase();
    let query, params;
    
    if (req.canAccessAllParkings) {
      // Admin sees all assistants
      query = `
        SELECT pa.id, pa.userId, pa.parkingId, pa.createdAt, pa.active,
               u.username, u.email, u.name,
               p.name as parkingName,
               creator.username as createdByUsername
        FROM parking_assistants pa
        JOIN users u ON pa.userId = u.id
        JOIN parkings p ON pa.parkingId = p.id
        LEFT JOIN users creator ON pa.createdBy = creator.id
        WHERE pa.active = 1
        ORDER BY pa.createdAt DESC
      `;
      params = [];
    } else {
      // Manager sees only their assistants
      const managerParkings = getManagerParkings(req.userId);
      if (managerParkings.length === 0) {
        return res.json([]);
      }
      
      const placeholders = managerParkings.map(() => '?').join(',');
      query = `
        SELECT pa.id, pa.userId, pa.parkingId, pa.createdAt, pa.active,
               u.username, u.email, u.name,
               p.name as parkingName,
               creator.username as createdByUsername
        FROM parking_assistants pa
        JOIN users u ON pa.userId = u.id
        JOIN parkings p ON pa.parkingId = p.id
        LEFT JOIN users creator ON pa.createdBy = creator.id
        WHERE pa.active = 1 AND pa.parkingId IN (${placeholders})
        ORDER BY pa.createdAt DESC
      `;
      params = managerParkings;
    }
    
    const stmt = db.prepare(query);
    const assistants = stmt.all(...params);
    
    res.json(assistants);
  } catch (error) {
    console.error('Error getting assistants:', error);
    res.status(500).json({ error: 'Error al obtener asistentes' });
  }
});

// Manager deactivates an assistant
router.delete('/:assistantId', requireParkingManager, (req, res) => {
  try {
    const { assistantId } = req.params;
    const db = getDatabase();
    
    // Verify the manager has access to this assistant's parking
    if (!req.canAccessAllParkings) {
      const checkStmt = db.prepare('SELECT parkingId FROM parking_assistants WHERE id = ?');
      const result = checkStmt.get(assistantId);
      
      if (!result) {
        return res.status(404).json({ error: 'Asistente no encontrado' });
      }
      
      const managerParkings = getManagerParkings(req.userId);
      if (!managerParkings.includes(result.parkingId)) {
        return res.status(403).json({ error: 'No tienes acceso a este asistente' });
      }
    }
    
    // Deactivate the assistant
    const stmt = db.prepare('UPDATE parking_assistants SET active = 0 WHERE id = ?');
    stmt.run(assistantId);
    saveDb();
    
    res.json({ success: true, message: 'Asistente desactivado' });
  } catch (error) {
    console.error('Error deactivating assistant:', error);
    res.status(500).json({ error: 'Error al desactivar asistente' });
  }
});

// Assistant or Manager updates vehicle count for a parking
router.post('/update-count', requireParkingAssistant, (req, res) => {
  try {
    const { parkingId, availableSpots, action } = req.body;
    
    if (!parkingId) {
      return res.status(400).json({ error: 'parkingId es requerido' });
    }
    
    // Verify user has access to this parking
    let hasAccess = false;
    if (req.canAccessAllParkings) {
      hasAccess = true;
    } else if (req.user.role === 'parking_manager') {
      const managerParkings = getManagerParkings(req.userId);
      hasAccess = managerParkings.includes(parkingId);
    } else if (req.user.role === 'parking_assistant') {
      const assistantParkings = getAssistantParkings(req.userId);
      hasAccess = assistantParkings.includes(parkingId);
    }
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'No tienes acceso a este parqueo' });
    }
    
    const db = getDatabase();
    
    // Get current parking info
    const getStmt = db.prepare('SELECT totalSpots, availableSpots FROM parkings WHERE id = ?');
    const currentParking = getStmt.get(parkingId);
    
    if (!currentParking) {
      return res.status(404).json({ error: 'Parqueo no encontrado' });
    }
    
    let newAvailableSpots;
    
    // If action is provided, increment/decrement
    if (action === 'vehicle_entered') {
      newAvailableSpots = Math.max(0, currentParking.availableSpots - 1);
    } else if (action === 'vehicle_exited') {
      newAvailableSpots = Math.min(currentParking.totalSpots, currentParking.availableSpots + 1);
    } else if (availableSpots !== undefined) {
      // Direct update
      newAvailableSpots = Math.max(0, Math.min(currentParking.totalSpots, availableSpots));
    } else {
      return res.status(400).json({ error: 'Se requiere action o availableSpots' });
    }
    
    // Update the parking
    const updateStmt = db.prepare('UPDATE parkings SET availableSpots = ? WHERE id = ?');
    updateStmt.run(newAvailableSpots, parkingId);
    saveDb();
    
    res.json({ 
      success: true, 
      parkingId,
      totalSpots: currentParking.totalSpots,
      availableSpots: newAvailableSpots,
      action: action || 'manual_update'
    });
  } catch (error) {
    console.error('Error updating vehicle count:', error);
    res.status(500).json({ error: 'Error al actualizar conteo' });
  }
});

module.exports = router;
