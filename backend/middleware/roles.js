const { findUserById } = require('../parkmaprdUserStore');
const dbModule = require('../db');

function requireRoles(roles = []) {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new Error('requireRoles needs a non-empty roles array');
  }
  return (req, res, next) => {
    if (!req.userId) return res.status(401).json({ error: 'unauthenticated' });
    const user = findUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'user not found' });
    // Permitir que 'main' actúe como 'mainadmin' para rutas administrativas
    const effectiveRole = user.role === 'main' ? 'mainadmin' : user.role;
    if (!roles.includes(effectiveRole)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    req.user = user;
    next();
  };
}

// Middleware to check if user is a parking manager for specific parking
function requireParkingManager(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'unauthenticated' });
  const user = findUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  
  // Admins and mainadmin can access all parkings
  if (['admin', 'mainadmin'].includes(user.role)) {
    req.user = user;
    req.canAccessAllParkings = true;
    return next();
  }
  
  // Check if user is parking_manager
  if (user.role !== 'parking_manager') {
    return res.status(403).json({ error: 'forbidden: requires parking_manager role' });
  }
  
  req.user = user;
  req.canAccessAllParkings = false;
  next();
}

// Get parking IDs that a manager can access
function getManagerParkings(userId) {
  try {
    const { getDatabase } = require('../db');
    const db = getDatabase();
    const stmt = db.prepare('SELECT parkingId FROM parking_managers WHERE userId = ? AND active = 1');
    const results = stmt.all(userId);
    return results.map(row => row.parkingId);
  } catch (error) {
    console.error('Error getting manager parkings:', error);
    return [];
  }
}

// Middleware to check if user is a parking assistant
function requireParkingAssistant(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'unauthenticated' });
  const user = findUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  
  // Admins, mainadmin, and managers can access
  if (['admin', 'mainadmin', 'parking_manager'].includes(user.role)) {
    req.user = user;
    req.canAccessAllParkings = ['admin', 'mainadmin'].includes(user.role);
    return next();
  }
  
  // Check if user is parking_assistant
  if (user.role !== 'parking_assistant') {
    return res.status(403).json({ error: 'forbidden: requires parking_assistant role' });
  }
  
  req.user = user;
  req.canAccessAllParkings = false;
  next();
}

// Get parking IDs that an assistant can access
function getAssistantParkings(userId) {
  try {
    const { getDatabase } = require('../db');
    const db = getDatabase();
    const stmt = db.prepare('SELECT parkingId FROM parking_assistants WHERE userId = ? AND active = 1');
    const results = stmt.all(userId);
    return results.map(row => row.parkingId);
  } catch (error) {
    console.error('Error getting assistant parkings:', error);
    return [];
  }
}

module.exports = { 
  requireRoles, 
  requireParkingManager, 
  getManagerParkings,
  requireParkingAssistant,
  getAssistantParkings
};