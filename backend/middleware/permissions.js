const { findUserById } = require('../parkmaprdUserStore');

// Central permission map (action -> roles allowed)
const permissions = {
  'parkings:create': ['admin', 'main'],
  'parkings:update': ['admin', 'main'],
  'parkings:delete': ['admin', 'main'],
  'promotions:create': ['admin', 'main'],
  'promotions:list-users': ['admin', 'main'],
  'admins:create': ['admin', 'main'],
  'users:delete': ['admin', 'main']
};

function requirePermission(action) {
  if (!action) throw new Error('requirePermission needs an action string');
  return (req, res, next) => {
    if (!req.userId) return res.status(401).json({ error: 'unauthenticated' });
    const user = findUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'user not found' });
    const allowedRoles = permissions[action];
    if (!allowedRoles) return res.status(500).json({ error: 'permission not configured', action });
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'forbidden', action });
    }
    next();
  };
}

module.exports = { permissions, requirePermission };