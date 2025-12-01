const express = require('express');
const { check, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const emailService = require('../emailService');
const {
  createUser,
  findUserByEmail,
  findUserByUsername,
} = require('../parkmaprdUserStore');
const { auditLogger, AUDIT_EVENTS, logger } = require('../logging');

// Factory to build auth router with injected JWT secret
module.exports = function buildAuthRouter(JWT_SECRET) {
  const router = express.Router();

  // Registro
  router.post('/register', [
    check('email').isEmail().withMessage('valid email required'),
    check('username').isString().notEmpty().withMessage('username required'),
    check('password').isLength({ min: 6 }).withMessage('password must be at least 6 chars'),
    check('name').optional().isString(),
    check('licensePlate').optional().isString()
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      auditLogger.logAuditEvent('registration_validation_failed', {
        userId: null,
        sessionId: req.audit?.sessionId,
        ipAddress: req.audit?.ipAddress,
        action: 'register_validation_failed',
        result: 'failure',
        metadata: { errors: errors.array(), email: req.body.email, username: req.body.username }
      });
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, username, password, name, licensePlate } = req.body;
    const existingEmail = findUserByEmail(email);
    if (existingEmail) {
      auditLogger.logAuditEvent('registration_failed', {
        userId: null,
        sessionId: req.audit?.sessionId,
        ipAddress: req.audit?.ipAddress,
        action: 'register_email_exists',
        result: 'failure',
        metadata: { email, username }
      });
      return res.status(400).json({ error: 'email already registered' });
    }
    const existingUsername = findUserByUsername(username);
    if (existingUsername) {
      auditLogger.logAuditEvent('registration_failed', {
        userId: null,
        sessionId: req.audit?.sessionId,
        ipAddress: req.audit?.ipAddress,
        action: 'register_username_exists',
        result: 'failure',
        metadata: { email, username }
      });
      return res.status(400).json({ error: 'username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = emailService.generateToken();
    const user = createUser({
      email,
      username,
      passwordHash,
      name,
      licensePlate,
      emailVerificationToken: verificationToken,
      emailVerified: 0
    });

    auditLogger.logAuditEvent(AUDIT_EVENTS.USER_REGISTRATION, {
      userId: user.id,
      sessionId: req.audit?.sessionId,
      ipAddress: req.audit?.ipAddress,
      action: 'user_registered',
      result: 'success',
      metadata: { email, username }
    });

    logger.info('New user registered', { userId: user.id, email, username });

    emailService.sendVerificationEmail(email, verificationToken, username).catch(err => {
      console.error('Error sending verification email:', err);
      auditLogger.logAuditEvent('email_verification_send_failed', {
        userId: user.id,
        sessionId: req.audit?.sessionId,
        ipAddress: req.audit?.ipAddress,
        action: 'send_verification_email',
        result: 'failure',
        metadata: { error: err.message }
      });
    });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user, message: 'Cuenta creada. Verifica tu correo.' });
  });

  // Login (username o email)
  router.post('/login', [
    check('password').isString().notEmpty().withMessage('password required'),
    check('username').isString().notEmpty().withMessage('username required')
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      auditLogger.logAuditEvent(AUDIT_EVENTS.FAILED_LOGIN, {
        userId: null,
        sessionId: req.audit?.sessionId,
        ipAddress: req.audit?.ipAddress,
        action: 'login_validation_failed',
        result: 'failure',
        metadata: { errors: errors.array(), username: req.body.username }
      });
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    // Admin shortcut
    if (username === 'admin' && password === 'admin') {
      let adminUser = findUserByUsername('admin') || findUserByEmail('admin@parkmaprd.local');
      if (!adminUser) {
        const hash = await bcrypt.hash('admin', 10);
        adminUser = createUser({ email: 'admin@parkmaprd.local', username: 'admin', passwordHash: hash, name: 'Admin', role: 'admin' });
      }
      const token = jwt.sign({ id: adminUser.id }, JWT_SECRET, { expiresIn: '7d' });
      auditLogger.logAuditEvent(AUDIT_EVENTS.ADMIN_LOGIN, {
        userId: adminUser.id,
        sessionId: req.audit?.sessionId,
        ipAddress: req.audit?.ipAddress,
        action: 'admin_login',
        result: 'success',
        metadata: { username: 'admin' }
      });
      return res.json({ token, user: adminUser });
    }

    let user = findUserByUsername(username);
    if (!user && username.includes('@')) user = findUserByEmail(username);
    if (!user) {
      return res.status(400).json({ error: 'invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(400).json({ error: 'invalid credentials' });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    auditLogger.logAuditEvent(AUDIT_EVENTS.USER_LOGIN, {
      userId: user.id,
      sessionId: req.audit?.sessionId,
      ipAddress: req.audit?.ipAddress,
      action: 'successful_login',
      result: 'success',
      metadata: { username, role: user.role || 'user' }
    });
    res.json({ token, user });
  });

  return router;
};
