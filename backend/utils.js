const jwt = require("jsonwebtoken");
function authMiddleware(secret) {
  return (req, res, next) => {
    const { authorization } = req.headers;
    if (!authorization) return res.status(401).json({ error: "no token" });
    const [type, token] = authorization.split(" ");
    if (type !== "Bearer" || !token) return res.status(401).json({ error: "bad token format" });
    try {
      const decoded = jwt.verify(token, secret);
      req.userId = decoded.id;
      next();
    } catch {
      return res.status(401).json({ error: "invalid token" });
    }
  };
}
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 6;
}

function validateLicensePlate(licensePlate) {
  if (!licensePlate || typeof licensePlate !== 'string') return false;
  return licensePlate.length >= 2 && licensePlate.length <= 20;
}

module.exports = { 
  authMiddleware, 
  validateEmail, 
  validatePassword, 
  validateLicensePlate 
};