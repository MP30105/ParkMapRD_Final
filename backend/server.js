// Load environment variables from .env (optional)
require('dotenv').config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { check, validationResult } = require('express-validator');
const cors = require("cors");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');

const parkingStore = require("./parkmaprdData");
const { authMiddleware } = require("./utils");
const { createAuditMiddleware, logger, auditLogger, AUDIT_EVENTS } = require('./logging');
const auditRoutes = require('./auditRoutes');

// Global error instrumentation to diagnose unexpected exits
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', err.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason);
});
// Exit diagnostics
process.on('beforeExit', (code) => {
  console.log('[BEFORE_EXIT] code=', code, 'time=', Date.now());
});
process.on('exit', (code) => {
  console.log('[EXIT] code=', code, 'time=', Date.now());
});

// Heartbeat to confirm process stays alive (every 30s)
setInterval(() => {
  try {
    logger.info('[heartbeat] backend alive');
  } catch (e) {
    console.log('[heartbeat] backend alive');
  }
}, 30000).unref();
const {
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserById,
  updateUser,
  listUsers,
  addCar,
  addTicket,
  updateTicket,
  deleteUser,
} = require("./parkmaprdUserStore");
const emailService = require('./emailService');
const stripeService = require('./stripeService');
const AutoCheckoutManager = require('./AutoCheckoutManager');
// Zod validation + global error handler imports
const { z } = require('zod');
const validate = require('./middleware/validate');
const errorHandler = require('./middleware/errorHandler');

// Initialize auto-checkout manager
const autoCheckoutManager = new AutoCheckoutManager();

// Define secrets BEFORE requiring routers so values exist
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwt';
const CAMERA_TOKEN = process.env.CAMERA_TOKEN || 'CAMERA_SECRET_123';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Modular routers (incremental refactor)
const authRouter = require('./routes/authRoutes')(process.env.JWT_SECRET || 'supersecretjwt');
const parkingRouter = require('./routes/parkingRoutes')(parkingStore, { CAMERA_TOKEN });
const paymentRouter = require('./routes/paymentRoutes')({
  JWT_SECRET: process.env.JWT_SECRET || 'supersecretjwt',
  parkingStore,
  stripeService,
  emailService,
  findUserById
});
const ticketRouter = require('./routes/ticketRoutes')(process.env.JWT_SECRET || 'supersecretjwt', parkingStore);


// Rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15') * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '5'),
  message: { success: false, message: 'Demasiados intentos, intenta más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration - restrict origins in production
const corsOptions = {
  origin: true, // Permitir cualquier origen temporalmente
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// Request ID middleware for traceability (added early)
try {
  const requestId = require('./middleware/requestId');
  app.use(requestId());
} catch (e) {
  console.error('[init] failed to load requestId middleware', e);
}

// Initialize audit middleware for all requests
app.use(createAuditMiddleware());

// Lightweight request logger for debugging connectivity
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

// Admin audit routes
app.use('/admin/audit', auditRoutes);
// New modular auth routes (parallel to legacy inline endpoints)
app.use('/api/parkmaprd/auth2', authRouter);
// Modular parking routes (incremental). "nearest" endpoint namespaced to /nearest/query to avoid clash.
app.use('/api/parkmaprd/parkings2', parkingRouter);
// Modular payments routes (parallel to legacy inline endpoints)
app.use('/api/parkmaprd', paymentRouter);
// New modular reservations routes (parallel to legacy)
// New modular bookings/tickets routes (replacing legacy inline endpoints incrementally)
app.use('/api/parkmaprd', ticketRouter);


// Create automatic reminders for a reservation
async function createReservationReminders(reservationId, userId, reservationData, db) {
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
        VALUES (?, 1, 1, '[15]')`);
      
      insertPrefStmt.bind([userId]);
      insertPrefStmt.step();
      insertPrefStmt.free();
      
      preferences = {
        emailEnabled: 1,
        pushEnabled: 1,
        reminderTimes: '[15]'
      };
    }
    
    // Only create reminders if user has enabled them
    if (!preferences.emailEnabled && !preferences.pushEnabled) return;
    
    // Get parking details
    const parkingStmt = db.prepare('SELECT * FROM parkings WHERE id = ?');
    parkingStmt.bind([reservationData.parkingId]);
    const hasParking = parkingStmt.step();
    const parking = hasParking ? parkingStmt.getAsObject() : { name: 'Unknown Parking' };
    if (hasParking) parkingStmt.free();
    
    // Calculate reminder time (15 minutes before reservation starts by default)
    const reservationStartTime = reservationData.startTime;
    const reminderTime = reservationStartTime - (15 * 60 * 1000); // 15 minutes before
    
    // Only create reminder if it's in the future
    if (reminderTime > Date.now()) {
      const reminderId = 'rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      const channels = [];
      if (preferences.emailEnabled) channels.push('email');
      if (preferences.pushEnabled) channels.push('app');
      
      const reminderStmt = db.prepare(`
        INSERT INTO reminders 
        (id, userId, type, title, message, scheduledTime, relatedId, channels, createdAt) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      const title = `🚗 Tu reserva comienza pronto`;
      const message = `Tu reserva en ${parking.name} (Espacio #${reservationData.spotNumber}) comienza en 15 minutos. ¡No olvides dirigirte al estacionamiento!`;
      
      reminderStmt.bind([
        reminderId,
        userId,
        'reservation_start',
        title,
        message,
        reminderTime,
        reservationId,
        JSON.stringify(channels),
        Date.now()
      ]);
      
      reminderStmt.step();
      reminderStmt.free();
    }
    
  } catch (error) {
    console.error('Error creating reservation reminders:', error);
  }
}

// Modular reservations router (new)
const reservationRouter = require('./routes/reservationRoutes')(process.env.JWT_SECRET || 'supersecretjwt', createReservationReminders);
// Mount reservation router after creation
app.use('/api/parkmaprd', reservationRouter);

// Parking Manager routes (protected)
const managerRouter = require('./routes/managerRoutes');
app.use('/api/parkmaprd/manager', authMiddleware(JWT_SECRET), managerRouter);

// Parking Assistant routes (protected)
const assistantRouter = require('./routes/assistantRoutes');
app.use('/api/parkmaprd/assistant', authMiddleware(JWT_SECRET), assistantRouter);

// ---------- AUTH ----------
app.post(
  "/api/parkmaprd/auth/register",
  authLimiter,
  [
    check('email').isEmail().withMessage('valid email required'),
    check('username').isString().notEmpty().withMessage('username required'),
    check('password').isLength({ min: 6 }).withMessage('password must be at least 6 chars'),
    check('name').optional().isString(),
    check('licensePlate').optional().isString()
  ],
  async (req, res) => {
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
      return res.status(400).json({ error: "email already registered" });
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
      return res.status(400).json({ error: "username already taken" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    // Generate email verification token
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
    
    // Log successful registration
    auditLogger.logAuditEvent(AUDIT_EVENTS.USER_REGISTRATION, {
      userId: user.id,
      sessionId: req.audit?.sessionId,
      ipAddress: req.audit?.ipAddress,
      action: 'user_registered',
      result: 'success',
      metadata: { 
        email, 
        username, 
        name: name || '',
        licensePlate: licensePlate || '',
        emailVerificationRequired: true
      }
    });
    
    logger.info('New user registered', { 
      userId: user.id, 
      email, 
      username,
      ipAddress: req.audit?.ipAddress 
    });
    
    // Send verification email (non-blocking)
    emailService.sendVerificationEmail(email, verificationToken, username)
      .catch(err => {
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
    
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ 
      token, 
      user,
      message: 'Cuenta creada. Por favor verifica tu correo electrónico.'
    });
  }
);

app.post(
  "/api/parkmaprd/auth/login",
  [
    check('password').isString().notEmpty().withMessage('password required'),
    check('username').isString().notEmpty().withMessage('username required')
  ],
  async (req, res) => {
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

    // Special admin login: username "admin" and password "admin"
    if (username === 'admin' && password === 'admin') {
      // Find existing admin or create one if missing
      let adminUser = findUserByUsername('admin');
      if (!adminUser) {
        adminUser = findUserByEmail('admin@parkmaprd.local');
      }
      if (!adminUser) {
        try {
          const hash = await bcrypt.hash('admin', 10);
          adminUser = createUser({ email: 'admin@parkmaprd.local', username: 'admin', passwordHash: hash, name: 'Admin', role: 'admin' });
          
          auditLogger.logAuditEvent(AUDIT_EVENTS.ADMIN_LOGIN, {
            userId: adminUser.id,
            sessionId: req.audit?.sessionId,
            ipAddress: req.audit?.ipAddress,
            action: 'admin_user_created_on_login',
            result: 'success',
            metadata: { username: 'admin', autoCreated: true }
          });
        } catch (e) {
          auditLogger.logSecurityEvent('admin_creation_failed', 'high', {
            username: 'admin',
            ipAddress: req.audit?.ipAddress,
            error: e.message
          });
          return res.status(500).json({ error: 'failed to ensure admin user' });
        }
      }
      
      const token = jwt.sign({ id: adminUser.id }, JWT_SECRET, { expiresIn: '7d' });
      
      // Log successful admin login
      auditLogger.logAuditEvent(AUDIT_EVENTS.ADMIN_LOGIN, {
        userId: adminUser.id,
        sessionId: req.audit?.sessionId,
        ipAddress: req.audit?.ipAddress,
        action: 'admin_login',
        result: 'success',
        metadata: { username: 'admin', role: adminUser.role }
      });
      
      auditLogger.logSecurityEvent('admin_login', 'medium', {
        userId: adminUser.id,
        username: 'admin',
        ipAddress: req.audit?.ipAddress,
        role: adminUser.role
      });
      
      logger.warn('Admin login detected', { 
        userId: adminUser.id, 
        ipAddress: req.audit?.ipAddress,
        username: 'admin'
      });
      
      return res.json({ token, user: adminUser });
    }

    // Username or Email-based login (fallback)
    let user = findUserByUsername(username);
    if (!user && username && username.includes('@')) {
      user = findUserByEmail(username);
    }
    if (!user) {
      auditLogger.logAuditEvent(AUDIT_EVENTS.FAILED_LOGIN, {
        userId: null,
        sessionId: req.audit?.sessionId,
        ipAddress: req.audit?.ipAddress,
        action: 'login_user_not_found',
        result: 'failure',
        metadata: { username }
      });
      
      auditLogger.logSecurityEvent('failed_login_attempt', 'low', {
        username,
        ipAddress: req.audit?.ipAddress,
        reason: 'user_not_found'
      });
      
      return res.status(400).json({ error: "invalid credentials" });
    }
    
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      auditLogger.logAuditEvent(AUDIT_EVENTS.FAILED_LOGIN, {
        userId: user.id,
        sessionId: req.audit?.sessionId,
        ipAddress: req.audit?.ipAddress,
        action: 'login_invalid_password',
        result: 'failure',
        metadata: { username, userId: user.id }
      });
      
      auditLogger.logSecurityEvent('failed_login_attempt', 'medium', {
        userId: user.id,
        username,
        ipAddress: req.audit?.ipAddress,
        reason: 'invalid_password'
      });
      
      return res.status(400).json({ error: "invalid credentials" });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    
    // Log successful login
    auditLogger.logAuditEvent(AUDIT_EVENTS.USER_LOGIN, {
      userId: user.id,
      sessionId: req.audit?.sessionId,
      ipAddress: req.audit?.ipAddress,
      action: 'successful_login',
      result: 'success',
      metadata: { 
        username, 
        role: user.role || 'user',
        lastLogin: new Date().toISOString()
      }
    });
    
    // Create audit session
    auditLogger.startSession(user.id, req.audit?.sessionId, req.audit?.ipAddress, req.audit?.userAgent);
    
    logger.info('User login successful', { 
      userId: user.id, 
      username, 
      ipAddress: req.audit?.ipAddress 
    });
    
    res.json({ token, user });
  }
);

// Email verification
app.get("/api/parkmaprd/auth/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Token requerido" });

  const { db } = require('./parkmaprdUserStore');
  const user = db.prepare('SELECT * FROM users WHERE emailVerificationToken = ?').get(token);
  
  if (!user) return res.status(400).json({ error: "Token inválido o expirado" });

  db.prepare('UPDATE users SET emailVerified = 1, emailVerificationToken = NULL WHERE id = ?').run(user.id);
  
  res.json({ success: true, message: "Email verificado exitosamente" });
});

// Request password reset
app.post("/api/parkmaprd/auth/forgot-password", authLimiter, [
  check('email').isEmail().withMessage('Email válido requerido')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email } = req.body;
  const user = findUserByEmail(email);
  
  // Always return success to prevent email enumeration
  if (!user) {
    return res.json({ success: true, message: "Si el correo existe, recibirás un enlace de recuperación" });
  }

  const resetToken = emailService.generateToken();
  const resetExpires = Date.now() + 3600000; // 1 hour

  const { db } = require('./parkmaprdUserStore');
  db.prepare('UPDATE users SET passwordResetToken = ?, passwordResetExpires = ? WHERE id = ?')
    .run(resetToken, resetExpires, user.id);

  // Send reset email (non-blocking)
  emailService.sendPasswordResetEmail(email, resetToken, user.username)
    .catch(err => console.error('Error sending password reset email:', err));

  res.json({ success: true, message: "Si el correo existe, recibirás un enlace de recuperación" });
});

// Reset password
app.post("/api/parkmaprd/auth/reset-password", authLimiter, [
  check('token').isString().notEmpty().withMessage('Token requerido'),
  check('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { token, password } = req.body;

  const { db } = require('./parkmaprdUserStore');
  const user = db.prepare('SELECT * FROM users WHERE passwordResetToken = ? AND passwordResetExpires > ?')
    .get(token, Date.now());

  if (!user) return res.status(400).json({ error: "Token inválido o expirado" });

  const passwordHash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET passwordHash = ?, passwordResetToken = NULL, passwordResetExpires = NULL WHERE id = ?')
    .run(passwordHash, user.id);

  res.json({ success: true, message: "Contraseña actualizada exitosamente" });
});

app.get("/api/parkmaprd/users/me", authMiddleware(JWT_SECRET), (req, res) => {
  const user = findUserById(req.userId);
  if (!user) return res.status(404).json({ error: "user not found" });
  res.json(user);
});

// user cars
app.post('/api/parkmaprd/users/me/cars', authMiddleware(JWT_SECRET), [check('plate').isString().notEmpty().withMessage('plate required')], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { brand, model, plate } = req.body;
  const car = addCar(req.userId, { brand, model, plate });
  if (!car) return res.status(404).json({ error: 'user not found' });
  res.json(car);
});

app.get('/api/parkmaprd/users/me/cars', authMiddleware(JWT_SECRET), (req, res) => {
  const user = findUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  res.json(user.cars || []);
});

// Update car
app.put('/api/parkmaprd/users/me/cars/:carId', authMiddleware(JWT_SECRET), (req, res) => {
  const { carId } = req.params;
  const { brand, model, plate } = req.body;
  const user = findUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  
  const car = user.cars.find(c => c.id === carId);
  if (!car) return res.status(404).json({ error: 'car not found' });
  
  try {
    const { getDb } = require('./parkmaprdUserStore');
    const { saveDb } = require('./db');
    const dbInstance = getDb();
    const stmt = dbInstance.prepare('UPDATE cars SET brand = ?, model = ?, plate = ? WHERE id = ? AND userId = ?');
    stmt.bind([brand || '', model || '', plate, carId, req.userId]);
    stmt.step();
    stmt.free();
    saveDb();
    
    const updatedCar = { ...car, brand, model, plate };
    res.json(updatedCar);
  } catch (e) {
    console.error('Error updating car:', e);
    res.status(500).json({ error: 'Error updating car' });
  }
});

// Delete car
app.delete('/api/parkmaprd/users/me/cars/:carId', authMiddleware(JWT_SECRET), (req, res) => {
  const { carId } = req.params;
  const user = findUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  
  const car = user.cars.find(c => c.id === carId);
  if (!car) return res.status(404).json({ error: 'car not found' });
  
  try {
    const { getDb } = require('./parkmaprdUserStore');
    const { saveDb } = require('./db');
    const dbInstance = getDb();
    const stmt = dbInstance.prepare('DELETE FROM cars WHERE id = ? AND userId = ?');
    stmt.bind([carId, req.userId]);
    stmt.step();
    stmt.free();
    saveDb();
    
    res.json({ message: 'car deleted' });
  } catch (e) {
    console.error('Error deleting car:', e);
    res.status(500).json({ error: 'Error deleting car' });
  }
});

// bookings / tickets legacy endpoints removed (migrated to modular ticketRouter)
// (POST /api/parkmaprd/bookings, GET /api/parkmaprd/users/me/tickets, POST /api/parkmaprd/tickets/:id/use)
// See routes/ticketRoutes.js for current implementations.

// role-based authorization middleware
const { requireRoles } = require('./middleware/roles');
const { requirePermission } = require('./middleware/permissions');

app.post('/api/parkmaprd/admin/parkings', authMiddleware(JWT_SECRET), requireRoles(['admin','main']), (req, res) => {
  const { id, name, lat, lng, totalSpots, availableSpots, securityVideoUrl, hourlyRate } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  if (!Number.isInteger(Number(totalSpots)) || Number(totalSpots) <= 0) return res.status(400).json({ error: 'totalSpots must be integer > 0' });
  const existing = parkingStore.getById(id);
  if (existing) return res.status(400).json({ error: 'parking id exists' });
  
  const parking = parkingStore.createParking({ 
    id, 
    name, 
    lat: parseFloat(lat) || 0, 
    lng: parseFloat(lng) || 0, 
    totalSpots: parseInt(totalSpots) || 10, 
    availableSpots: availableSpots !== undefined ? parseInt(availableSpots) : parseInt(totalSpots) || 10,
    securityVideoUrl: securityVideoUrl || '',
    hourlyRate: parseInt(hourlyRate) || 100
  });
  res.json(parking);
});

app.put('/api/parkmaprd/admin/parkings/:id', authMiddleware(JWT_SECRET), requireRoles(['admin','main']), (req, res) => {
  const pid = req.params.id;
  const patch = {};
  if (req.body.name !== undefined) patch.name = req.body.name;
  if (req.body.lat !== undefined) patch.lat = parseFloat(req.body.lat);
  if (req.body.lng !== undefined) patch.lng = parseFloat(req.body.lng);
  if (req.body.totalSpots !== undefined) patch.totalSpots = parseInt(req.body.totalSpots);
  if (req.body.availableSpots !== undefined) patch.availableSpots = parseInt(req.body.availableSpots);
  if (req.body.securityVideoUrl !== undefined) patch.securityVideoUrl = req.body.securityVideoUrl;
  if (req.body.hourlyRate !== undefined) patch.hourlyRate = parseInt(req.body.hourlyRate);
  
  const updated = parkingStore.updateParking(pid, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

// Re-added delete endpoint with permission mapping
app.delete('/api/parkmaprd/admin/parkings/:id', authMiddleware(JWT_SECRET), requirePermission('parkings:delete'), (req, res) => {
  const removed = parkingStore.deleteParking(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true, removed });
});

// Re-added bulk import endpoint
const bulkParkingsSchema = z.object({
  parkings: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    lat: z.union([z.string(), z.number()]).optional(),
    lng: z.union([z.string(), z.number()]).optional(),
    totalSpots: z.union([z.string(), z.number()]).optional(),
    availableSpots: z.union([z.string(), z.number()]).optional(),
    hourlyRate: z.union([z.string(), z.number()]).optional(),
    securityVideoUrl: z.string().optional()
  }))
});
app.post('/api/parkmaprd/admin/parkings/bulk', authMiddleware(JWT_SECRET), requirePermission('parkings:create'), validate(bulkParkingsSchema), (req, res) => {
  const results = { success: [], errors: [] };
  for (const parkingData of req.validatedBody.parkings) {
    try {
      const { id, name, lat, lng, totalSpots, availableSpots, hourlyRate, securityVideoUrl } = parkingData;
      if (!id || !name) {
        results.errors.push({ parking: parkingData, error: 'id and name required' });
        continue;
      }
      const existing = parkingStore.getById(id);
      if (existing) {
        results.errors.push({ parking: parkingData, error: 'parking id already exists' });
        continue;
      }
      const parking = parkingStore.createParking({
        id,
        name,
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
        totalSpots: parseInt(totalSpots) || 10,
        availableSpots: availableSpots !== undefined ? parseInt(availableSpots) : parseInt(totalSpots) || 10,
        hourlyRate: parseInt(hourlyRate) || 100,
        securityVideoUrl: securityVideoUrl || ''
      });
      results.success.push(parking);
    } catch (e) {
      results.errors.push({ parking: parkingData, error: e.message });
    }
  }
  res.json({ imported: results.success.length, errors: results.errors.length, results });
});

// Admin create promotion handled below with Zod (legacy inline removed)

// Zod-based admin promotion creation
const promotionCreateSchema = z.object({
  code: z.string().min(3),
  title: z.string().min(3),
  description: z.string().optional(),
  type: z.string().min(2),
  discountPercent: z.number().int().min(1).max(100).optional(),
  discountAmount: z.number().positive().optional(),
  minAmount: z.number().positive().optional(),
  maxUses: z.number().int().positive().optional(),
  validFrom: z.number().int().optional(),
  validUntil: z.number().int().optional()
}).refine(d => !(d.discountPercent && d.discountAmount), {
  message: 'Use either discountPercent or discountAmount, not both'
});

app.post('/api/parkmaprd/admin/promotions', authMiddleware(JWT_SECRET), requirePermission('promotions:create'), validate(promotionCreateSchema), (req, res) => {
  const data = req.validatedBody;
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  const promoId = 'promo_' + Date.now();
  const stmt = db.prepare('INSERT INTO promotions (id, code, title, description, type, discountPercent, discountAmount, minAmount, maxUses, validFrom, validUntil, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  try {
    stmt.bind([
      promoId,
      data.code.toUpperCase(),
      data.title,
      data.description || '',
      data.type,
      data.discountPercent || null,
      data.discountAmount || null,
      data.minAmount || null,
      data.maxUses || null,
      data.validFrom || Date.now(),
      data.validUntil || (Date.now() + 30*24*60*60*1000),
      Date.now()
    ]);
    stmt.step();
    stmt.free();
    saveDb();
    res.json({ success: true, id: promoId });
  } catch (error) {
    stmt.free();
    if (error.message.includes('UNIQUE')) return res.status(400).json({ error: 'Código ya existe' });
    res.status(500).json({ error: 'Error creando promoción' });
  }
});

app.get('/api/parkmaprd/admin/users', authMiddleware(JWT_SECRET), requirePermission('promotions:list-users'), (req, res) => {
  res.json(listUsers());
});

// Create new user (admin/main only)
app.post('/api/parkmaprd/admin/users', authMiddleware(JWT_SECRET), requirePermission('admins:create'), async (req, res) => {
  const { email, password, username, name, role } = req.body;
  
  if (!email || !password || !username) {
    return res.status(400).json({ error: 'Email, username y contraseña son requeridos' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  // Validate role
  const allowedRoles = ['user', 'admin'];
  const actor = findUserById(req.userId);
  if (actor.role === 'main') allowedRoles.push('main');
  
  if (!allowedRoles.includes(role)) {
    return res.status(403).json({ error: 'No tienes permiso para crear usuarios con ese rol' });
  }

  // Check if email or username already exists
  const existingUser = listUsers().find(u => u.email === email || u.username === username);
  if (existingUser) {
    if (existingUser.email === email) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
    if (existingUser.username === username) {
      return res.status(400).json({ error: 'El username ya está en uso' });
    }
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = createUser({
      email,
      username,
      passwordHash: hashedPassword,
      name: name || '',
      role: role || 'user',
      emailVerified: true, // Admin-created users are pre-verified
      createdAt: Date.now()
    });

    auditLogger.logAuditEvent('user_created_by_admin', {
      userId: req.userId,
      action: 'create_user',
      result: 'success',
      metadata: { 
        newUserId: newUser.id, 
        newUserEmail: newUser.email, 
        newUserRole: newUser.role 
      }
    });

    res.json({
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      name: newUser.name,
      role: newUser.role
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// Delete user (admin/main) - prevents self-delete and protects main admin from non-main roles
app.delete('/api/parkmaprd/admin/users/:id', authMiddleware(JWT_SECRET), requirePermission('users:delete'), (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.userId) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  const target = findUserById(targetId);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  // Only main admin can delete other main admins
  if (target.role === 'main') {
    const actor = findUserById(req.userId);
    if (actor.role !== 'main') return res.status(403).json({ error: 'No autorizado para eliminar usuario principal' });
  }
  const removed = deleteUser(targetId);
  if (!removed) return res.status(500).json({ error: 'Error eliminando usuario' });
  try {
    auditLogger.logAuditEvent('user_deleted', {
      userId: req.userId,
      action: 'admin_delete_user',
      result: 'success',
      metadata: { deletedUserId: removed.id, deletedEmail: removed.email, deletedRole: removed.role }
    });
  } catch (_) {}
  res.json({ success: true, removed: { id: removed.id, email: removed.email, username: removed.username, role: removed.role } });
});

app.post('/api/parkmaprd/admin/admins', authMiddleware(JWT_SECRET), requirePermission('admins:create'), async (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const existing = findUserByEmail(email);
  if (existing) return res.status(400).json({ error: 'email exists' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = createUser({ email, passwordHash, name, role: role || 'admin' });
  res.json(user);
});

// ---------- PARKINGS ----------
// IMPORTANT: Specific routes first (e.g. /nearest) before param routes to avoid capture by :id.
app.get("/api/parkmaprd/parkings/nearest", (req, res) => {
  const { lat, lng, limit } = req.query;
  const userLat = parseFloat(lat);
  const userLng = parseFloat(lng);
  const maxResults = parseInt(limit) || 5;
  const all = parkingStore.getAll();
  
  if (all.length === 0) {
    return res.json([]);
  }

  function dist(aLat, aLng, bLat, bLng) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (bLat - aLat) * Math.PI / 180;
    const dLng = (bLng - aLng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  // Filtrar parqueos con espacios disponibles primero
  const withSpots = all.filter((p) => p.availableSpots > 0);
  const toSort = withSpots.length > 0 ? withSpots : all;
  
  // Ordenar por distancia y agregar distancia calculada
  const sorted = toSort.map(p => ({
    ...p,
    distanceKm: dist(userLat, userLng, p.lat, p.lng)
  })).sort((a, b) => a.distanceKm - b.distanceKm);
  
  // Retornar los N más cercanos
  return res.json(sorted.slice(0, maxResults));
});

app.get("/api/parkmaprd/parkings", (req, res) => res.json(parkingStore.getAll()));

app.get("/api/parkmaprd/parkings/:id", (req, res) => {
  // Guard clause: prevent accidental capture of reserved keyword 'nearest'
  if (req.params.id === 'nearest') {
    return res.status(400).json({ error: 'Use /parkmaprd/parkings/nearest endpoint' });
  }
  const p = parkingStore.getById(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

app.post(
  "/api/parkmaprd/parkings/:id/availability",
  [check('availableSpots').isInt({ min: 0 }).withMessage('availableSpots must be integer >= 0')],
  (req, res) => {
    const { authorization } = req.headers;
    if (!authorization || authorization !== `Bearer ${CAMERA_TOKEN}`)
      return res.status(401).json({ error: "unauthorized camera" });

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { availableSpots } = req.body;
    const updated = parkingStore.updateAvailability(req.params.id, availableSpots);
    if (!updated) return res.status(404).json({ error: "Parking not found" });
    
    // Broadcast availability update to all connected clients
    if (app.locals.broadcast) {
      app.locals.broadcast({
        type: 'parking_update',
        parkingId: req.params.id,
        availableSpots: updated.availableSpots,
        totalSpots: updated.totalSpots
      });
    }
    
    res.json(updated);
  }
);

// ---------- PAYMENTS (legacy inline deprecated; migrated to paymentRoutes) ----------
// app.post("/api/parkmaprd/payments/checkout", ...) -- handled by modular paymentRouter now.

// ---- Favorites ----
app.get('/api/parkmaprd/users/me/favorites', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  const stmt = db.prepare('SELECT parkingId FROM favorites WHERE userId = ?');
  try {
    stmt.bind([req.userId]);
    const favorites = [];
    while (stmt.step()) {
      favorites.push(stmt.getAsObject().parkingId);
    }
    res.json(favorites);
  } finally {
    stmt.free();
  }
});

app.post('/api/parkmaprd/users/me/favorites/:parkingId', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  const id = 'fav' + Date.now() + Math.random().toString(36).slice(2, 6);
  try {
    const stmt = db.prepare('INSERT INTO favorites (id, userId, parkingId, createdAt) VALUES (?,?,?,?)');
    stmt.bind([id, req.userId, req.params.parkingId, Date.now()]);
    stmt.step();
    stmt.free();
    saveDb();
    res.json({ ok: true, id });
  } catch (e) {
    res.status(400).json({ error: 'Already favorited or invalid parking' });
  }
});

app.delete('/api/parkmaprd/users/me/favorites/:parkingId', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  const stmt = db.prepare('DELETE FROM favorites WHERE userId = ? AND parkingId = ?');
  stmt.bind([req.userId, req.params.parkingId]);
  stmt.step();
  stmt.free();
  saveDb();
  res.json({ ok: true });
});

// ---- Reservations ----
// Legacy inline reservation endpoint (kept for backward compatibility). Updated to use configurable window.
app.post('/api/parkmaprd/reservations', authMiddleware(JWT_SECRET), async (req, res) => {
  const { parkingId, startTime, duration } = req.body;
  if (!parkingId || !startTime || !duration) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const MAX_ADVANCE_DAYS = parseInt(process.env.RESERVATION_MAX_DAYS || '30');
  const MAX_ADVANCE_MS = MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (startTime < now || startTime > now + MAX_ADVANCE_MS) {
    return res.status(400).json({ error: `Invalid reservation time (max ${MAX_ADVANCE_DAYS}d advance)` });
  }

  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  const id = 'res' + Date.now() + Math.random().toString(36).slice(2, 6);
  const endTime = startTime + duration * 60 * 1000;
  const amount = (duration / 60) * 2.5; // $2.5 per hour
  const spotNumber = Math.floor(Math.random() * 50) + 1;
  
  const stmt = db.prepare(`INSERT INTO reservations (id, userId, parkingId, spotNumber, startTime, endTime, status, amount, createdAt) 
    VALUES (?,?,?,?,?,?,?,?,?)`);
  stmt.bind([id, req.userId, parkingId, spotNumber, startTime, endTime, 'confirmed', amount, now]);
  stmt.step();
  stmt.free();
  
  // Create reminders for reservation
  await createReservationReminders(id, req.userId, {
    parkingId,
    spotNumber,
    startTime,
    endTime,
    duration
  }, db);
  
  saveDb();

  res.json({ id, startTime, endTime, amount, status: 'confirmed' });
});

app.get('/api/parkmaprd/users/me/reservations', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM reservations WHERE userId = ? ORDER BY startTime DESC');
  try {
    stmt.bind([req.userId]);
    const reservations = [];
    while (stmt.step()) {
      reservations.push(stmt.getAsObject());
    }
    res.json(reservations);
  } finally {
    stmt.free();
  }
});

// Cancel reservation
app.delete('/api/parkmaprd/reservations/:id', authMiddleware(JWT_SECRET), (req, res) => {
  const { id } = req.params;
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  let stmt = db.prepare('SELECT * FROM reservations WHERE id = ? AND userId = ?');
  try {
    stmt.bind([id, req.userId]);
    if (!stmt.step()) {
      return res.status(404).json({ error: 'Reservación no encontrada' });
    }
    const reservation = stmt.getAsObject();
    
    // Check if reservation hasn't started yet
    if (reservation.startTime <= Date.now()) {
      return res.status(400).json({ error: 'No se puede cancelar una reservación que ya comenzó' });
    }
  } finally {
    stmt.free();
  }
  
  stmt = db.prepare('DELETE FROM reservations WHERE id = ? AND userId = ?');
  try {
    stmt.bind([id, req.userId]);
    stmt.step();
    saveDb();
    res.json({ message: 'Reservación cancelada' });
  } finally {
    stmt.free();
  }
});

// Extend reservation
app.post('/api/parkmaprd/reservations/:id/extend', authMiddleware(JWT_SECRET), (req, res) => {
  const { id } = req.params;
  const { additionalHours } = req.body;
  
  if (!additionalHours || additionalHours < 1 || additionalHours > 5) {
    return res.status(400).json({ error: 'Las horas adicionales deben ser entre 1 y 5' });
  }
  
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  let stmt = db.prepare('SELECT * FROM reservations WHERE id = ? AND userId = ?');
  try {
    stmt.bind([id, req.userId]);
    if (!stmt.step()) {
      return res.status(404).json({ error: 'Reservación no encontrada' });
    }
    const reservation = stmt.getAsObject();
    
    // Check if reservation hasn't started yet
    if (reservation.startTime <= Date.now()) {
      return res.status(400).json({ error: 'Solo se pueden extender reservaciones que no han comenzado' });
    }
    
    const additionalMs = additionalHours * 60 * 60 * 1000;
    const newEndTime = reservation.endTime + additionalMs;
    const additionalCost = additionalHours * 100; // RD$100 per hour
    const newAmount = reservation.amount + additionalCost;
    
    stmt.free();
    stmt = db.prepare('UPDATE reservations SET endTime = ?, amount = ? WHERE id = ?');
    stmt.bind([newEndTime, newAmount, id]);
    stmt.step();
    saveDb();
    
    stmt.free();
    stmt = db.prepare('SELECT * FROM reservations WHERE id = ?');
    stmt.bind([id]);
    stmt.step();
    const updated = stmt.getAsObject();
    
    res.json(updated);
  } finally {
    stmt.free();
  }
});

// ---- Ticket Extensions ----
// ticket extension legacy endpoint removed (handled by ticketRouter placeholder returning 501 until migration completed)

// ---- Stripe Payment Integration ----

// Create checkout session for new ticket
app.post('/api/parkmaprd/tickets/checkout', authMiddleware(JWT_SECRET), async (req, res) => {
  try {
    const { parkingId, duration, zone, spotNumber } = req.body;
    
    const user = findUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const parking = parkingStore.find(p => p.id === parkingId);
    if (!parking) return res.status(404).json({ error: 'Estacionamiento no encontrado' });

    const amount = (duration / 60) * 100; // RD$100 per hour
    
    // Create pending ticket
    const ticketId = 'tix' + Date.now();
    const { getDb, saveDb } = require('./db');
    const db = getDb();
    
    const stmt = db.prepare(`INSERT INTO tickets 
      (id, parkingId, userId, carId, zone, spotNumber, startTime, endTime, status, qrCode) 
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    
    const startTime = Date.now();
    const endTime = startTime + duration * 60 * 1000;
    const qrData = JSON.stringify({ ticketId, parkingId, userId: req.userId });
    const qrCodeUrl = await QRCode.toDataURL(qrData);
    
    stmt.bind([ticketId, parkingId, req.userId, null, zone, spotNumber, startTime, endTime, 'pending', qrCodeUrl]);
    stmt.step();
    stmt.free();
    
    // Create payment record
    const paymentId = 'pay' + Date.now();
    const payStmt = db.prepare(`INSERT INTO payments 
      (id, userId, parkingId, ticketId, amount, status, createdAt) 
      VALUES (?,?,?,?,?,?,?)`);
    payStmt.bind([paymentId, req.userId, parkingId, ticketId, amount, 'pending', Date.now()]);
    payStmt.step();
    payStmt.free();
    
    saveDb();

    // Create Stripe checkout session
    const session = await stripeService.createCheckoutSession({
      parkingName: parking.name,
      zone,
      spotNumber,
      amount,
      ticketId,
      parkingId,
      userEmail: user.email,
    }, req.userId);

    res.json({ 
      sessionId: session.id, 
      url: session.url,
      ticketId,
      paymentId 
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Error al procesar el pago' });
  }
});

// Stripe webhook handler
// Stripe webhook migrated to paymentRoutes (/api/parkmaprd/webhooks/stripe)

// Get payment status
// Payment status endpoint migrated to paymentRoutes (/api/parkmaprd/payments/:id)

// ---- Reviews ----
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  securityRating: z.number().int().min(1).max(5).optional(),
  cleanlinessRating: z.number().int().min(1).max(5).optional(),
  accessibilityRating: z.number().int().min(1).max(5).optional()
});
app.post('/api/parkmaprd/parkings/:id/reviews', authMiddleware(JWT_SECRET), validate(reviewSchema), (req, res) => {
  const { rating, comment, securityRating, cleanlinessRating, accessibilityRating } = req.validatedBody;
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  const id = 'rev' + Date.now() + Math.random().toString(36).slice(2, 6);
  const stmt = db.prepare(`INSERT INTO reviews (id, parkingId, userId, rating, comment, securityRating, cleanlinessRating, accessibilityRating, createdAt) VALUES (?,?,?,?,?,?,?,?,?)`);
  stmt.bind([id, req.params.id, req.userId, rating, comment || '', securityRating || rating, cleanlinessRating || rating, accessibilityRating || rating, Date.now()]);
  stmt.step();
  stmt.free();
  saveDb();
  res.json({ id, rating, comment: comment || '' });
});

app.get('/api/parkmaprd/parkings/:id/reviews', (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM reviews WHERE parkingId = ? ORDER BY createdAt DESC');
  try {
    stmt.bind([req.params.id]);
    const reviews = [];
    while (stmt.step()) {
      reviews.push(stmt.getAsObject());
    }
    res.json(reviews);
  } finally {
    stmt.free();
  }
});

// ---- Frequent Locations ----
app.get('/api/parkmaprd/users/me/frequent-locations', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM frequentLocations WHERE userId = ? ORDER BY visitCount DESC LIMIT 5');
  try {
    stmt.bind([req.userId]);
    const locations = [];
    while (stmt.step()) {
      locations.push(stmt.getAsObject());
    }
    res.json(locations);
  } finally {
    stmt.free();
  }
});

app.post('/api/parkmaprd/users/me/frequent-locations', authMiddleware(JWT_SECRET), (req, res) => {
  const { parkingId, label } = req.body;
  const { getDb, saveDb } = require('./db');
  const db = getDb();

  // Check if already exists
  const checkStmt = db.prepare('SELECT * FROM frequentLocations WHERE userId = ? AND parkingId = ?');
  checkStmt.bind([req.userId, parkingId]);
  const exists = checkStmt.step();
  
  if (exists) {
    const existing = checkStmt.getAsObject();
    checkStmt.free();
    // Update
    const updateStmt = db.prepare('UPDATE frequentLocations SET visitCount = ?, lastVisit = ?, label = ? WHERE id = ?');
    updateStmt.bind([parseInt(existing.visitCount) + 1, Date.now(), label || existing.label, existing.id]);
    updateStmt.step();
    updateStmt.free();
  } else {
    checkStmt.free();
    // Insert
    const id = 'freq' + Date.now();
    const insertStmt = db.prepare('INSERT INTO frequentLocations (id, userId, parkingId, label, visitCount, lastVisit) VALUES (?,?,?,?,?,?)');
    insertStmt.bind([id, req.userId, parkingId, label || 'Frecuente', 1, Date.now()]);
    insertStmt.step();
    insertStmt.free();
  }
  
  saveDb();
  res.json({ ok: true });
});

// ---- User Preferences ----
app.get('/api/parkmaprd/users/me/preferences', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM userPreferences WHERE userId = ?');
  stmt.bind([req.userId]);
  if (stmt.step()) {
    const prefs = stmt.getAsObject();
    stmt.free();
    res.json(prefs);
  } else {
    stmt.free();
    // Return defaults
    res.json({
      userId: req.userId,
      theme: 'auto',
      primaryColor: '#06b6d4',
      fontSize: 'medium',
      layoutDensity: 'normal',
      biometricEnabled: 0,
      autoRenewEnabled: 0,
      notificationsEnabled: 1
    });
  }
});

app.put('/api/parkmaprd/users/me/preferences', authMiddleware(JWT_SECRET), (req, res) => {
  const { theme, primaryColor, fontSize, layoutDensity, biometricEnabled, autoRenewEnabled, notificationsEnabled } = req.body;
  const { getDb, saveDb } = require('./db');
  const db = getDb();

  // Check if exists
  const checkStmt = db.prepare('SELECT * FROM userPreferences WHERE userId = ?');
  checkStmt.bind([req.userId]);
  const exists = checkStmt.step();
  checkStmt.free();

  if (exists) {
    const updateStmt = db.prepare(`UPDATE userPreferences SET theme = ?, primaryColor = ?, fontSize = ?, layoutDensity = ?, 
      biometricEnabled = ?, autoRenewEnabled = ?, notificationsEnabled = ? WHERE userId = ?`);
    updateStmt.bind([theme, primaryColor, fontSize, layoutDensity, biometricEnabled ? 1 : 0, autoRenewEnabled ? 1 : 0, notificationsEnabled ? 1 : 0, req.userId]);
    updateStmt.step();
    updateStmt.free();
  } else {
    const insertStmt = db.prepare(`INSERT INTO userPreferences (userId, theme, primaryColor, fontSize, layoutDensity, biometricEnabled, autoRenewEnabled, notificationsEnabled) 
      VALUES (?,?,?,?,?,?,?,?)`);
    insertStmt.bind([req.userId, theme, primaryColor, fontSize, layoutDensity, biometricEnabled ? 1 : 0, autoRenewEnabled ? 1 : 0, notificationsEnabled ? 1 : 0]);
    insertStmt.step();
    insertStmt.free();
  }

  saveDb();
  res.json({ ok: true });
});

// ---- Security Incidents ----
app.post('/api/parkmaprd/incidents', authMiddleware(JWT_SECRET), (req, res) => {
  const { parkingId, type, description, severity, lat, lng } = req.body;
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  const id = 'inc' + Date.now() + Math.random().toString(36).slice(2, 6);
  const stmt = db.prepare(`INSERT INTO securityIncidents (id, parkingId, userId, type, description, severity, lat, lng, createdAt, status) 
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  stmt.bind([id, parkingId || '', req.userId, type, description, severity, lat || 0, lng || 0, Date.now(), 'open']);
  stmt.step();
  stmt.free();
  saveDb();

  // Broadcast to all users near this location
  if (app.locals.broadcast) {
    app.locals.broadcast({
      type: 'security_alert',
      incidentId: id,
      parkingId,
      severity,
      description: severity === 'high' ? description : 'Incidente reportado en la zona'
    });
  }

  res.json({ id, status: 'reported' });
});

app.get('/api/parkmaprd/incidents', (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM securityIncidents WHERE status = ? ORDER BY createdAt DESC LIMIT 50');
  stmt.bind(['open']);
  const incidents = [];
  while (stmt.step()) {
    incidents.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(incidents);
});

// ---- QR Ticket Validation ----
app.post('/api/parkmaprd/tickets/validate', authMiddleware(JWT_SECRET), (req, res) => {
  const { qrData } = req.body;
  
  if (!qrData) return res.status(400).json({ error: 'QR data required' });

  try {
    const data = JSON.parse(qrData);
    const { ticketId, parkingId, userId } = data;

    const { getDb, saveDb } = require('./db');
    const db = getDb();
    
    const stmt = db.prepare('SELECT * FROM tickets WHERE id = ? AND parkingId = ?');
    stmt.bind([ticketId, parkingId]);
    const hasTicket = stmt.step();
    
    if (!hasTicket) {
      stmt.free();
      return res.status(404).json({ error: 'Ticket inválido', valid: false });
    }
    
    const ticket = stmt.getAsObject();
    stmt.free();

    // Check if ticket is active and not expired
    const now = Date.now();
    if (ticket.status !== 'active') {
      return res.json({ 
        valid: false, 
        error: 'Ticket no está activo',
        ticket 
      });
    }

    if (now > ticket.endTime) {
      return res.json({ 
        valid: false, 
        error: 'Ticket expirado',
        ticket 
      });
    }

    if (ticket.validatedAt) {
      return res.json({ 
        valid: true, 
        alreadyValidated: true,
        message: 'Ticket ya validado anteriormente',
        validatedAt: ticket.validatedAt,
        ticket 
      });
    }

    // Mark as validated
    const updateStmt = db.prepare('UPDATE tickets SET validatedAt = ? WHERE id = ?');
    updateStmt.bind([now, ticketId]);
    updateStmt.step();
    updateStmt.free();
    
    saveDb();

    res.json({ 
      valid: true, 
      message: 'Ticket validado exitosamente',
      validatedAt: now,
      ticket: { ...ticket, validatedAt: now }
    });
  } catch (error) {
    console.error('QR validation error:', error);
    res.status(400).json({ error: 'Formato de QR inválido', valid: false });
  }
});

// Generate QR code for existing ticket
app.get('/api/parkmaprd/tickets/:id/qr', authMiddleware(JWT_SECRET), async (req, res) => {
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  const stmt = db.prepare('SELECT * FROM tickets WHERE id = ? AND userId = ?');
  stmt.bind([req.params.id, req.userId]);
  const hasTicket = stmt.step();
  
  if (!hasTicket) {
    stmt.free();
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }
  
  const ticket = stmt.getAsObject();
  stmt.free();

  try {
    // If QR already exists, return it
    if (ticket.qrCode) {
      return res.json({ qrCode: ticket.qrCode });
    }

    // Generate new QR
    const qrData = JSON.stringify({
      ticketId: ticket.id,
      parkingId: ticket.parkingId,
      userId: ticket.userId
    });
    
    const qrCodeUrl = await QRCode.toDataURL(qrData);
    
    // Save to database
    const updateStmt = db.prepare('UPDATE tickets SET qrCode = ? WHERE id = ?');
    updateStmt.bind([qrCodeUrl, req.params.id]);
    updateStmt.step();
    updateStmt.free();
    
    saveDb();

    res.json({ qrCode: qrCodeUrl });
  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({ error: 'Error generando código QR' });
  }
});

// ---- Onboarding ----
app.get('/api/parkmaprd/users/me/onboarding', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM onboardingProgress WHERE userId = ?');
  stmt.bind([req.userId]);
  if (stmt.step()) {
    const progress = stmt.getAsObject();
    stmt.free();
    res.json(progress);
  } else {
    stmt.free();
    res.json({ userId: req.userId, step: 0, completed: 0, lastUpdated: Date.now() });
  }
});

app.put('/api/parkmaprd/users/me/onboarding', authMiddleware(JWT_SECRET), (req, res) => {
  const { step, completed } = req.body;
  const { getDb, saveDb } = require('./db');
  const db = getDb();

  const checkStmt = db.prepare('SELECT * FROM onboardingProgress WHERE userId = ?');
  checkStmt.bind([req.userId]);
  const exists = checkStmt.step();
  checkStmt.free();

  if (exists) {
    const updateStmt = db.prepare('UPDATE onboardingProgress SET step = ?, completed = ?, lastUpdated = ? WHERE userId = ?');
    updateStmt.bind([step, completed ? 1 : 0, Date.now(), req.userId]);
    updateStmt.step();
    updateStmt.free();
  } else {
    const insertStmt = db.prepare('INSERT INTO onboardingProgress (userId, step, completed, lastUpdated) VALUES (?,?,?,?)');
    insertStmt.bind([req.userId, step, completed ? 1 : 0, Date.now()]);
    insertStmt.step();
    insertStmt.free();
  }

  saveDb();
  res.json({ ok: true });
});

// ---- Wallet Balance ----
app.get('/api/parkmaprd/users/me/wallet', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM walletBalance WHERE userId = ?');
  stmt.bind([req.userId]);
  if (stmt.step()) {
    const wallet = stmt.getAsObject();
    stmt.free();
    res.json(wallet);
  } else {
    stmt.free();
    res.json({ userId: req.userId, balance: 0, lastUpdated: Date.now() });
  }
});

app.post('/api/parkmaprd/users/me/wallet/recharge', authMiddleware(JWT_SECRET), (req, res) => {
  const { amount } = req.body;
  if (!amount || amount < 50 || amount > 2000) {
    return res.status(400).json({ error: 'Invalid amount (RD$50-2000)' });
  }

  const { getDb, saveDb } = require('./db');
  const db = getDb();

  const checkStmt = db.prepare('SELECT * FROM walletBalance WHERE userId = ?');
  checkStmt.bind([req.userId]);
  const exists = checkStmt.step();
  
  if (exists) {
    const current = checkStmt.getAsObject();
    checkStmt.free();
    const newBalance = parseFloat(current.balance) + amount;
    const updateStmt = db.prepare('UPDATE walletBalance SET balance = ?, lastUpdated = ? WHERE userId = ?');
    updateStmt.bind([newBalance, Date.now(), req.userId]);
    updateStmt.step();
    updateStmt.free();
    saveDb();
    res.json({ balance: newBalance, recharged: amount });
  } else {
    checkStmt.free();
    const insertStmt = db.prepare('INSERT INTO walletBalance (userId, balance, lastUpdated) VALUES (?,?,?)');
    insertStmt.bind([req.userId, amount, Date.now()]);
    insertStmt.step();
    insertStmt.free();
    saveDb();
    res.json({ balance: amount, recharged: amount });
  }
});

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

// ---- Version info ----
// Simple endpoint to allow frontend to verify it is talking to the latest server build.
// We read package.json version once (cached) and attach a boot timestamp.
const pkg = require('./package.json');
const serverBootTime = new Date().toISOString();
app.get('/api/version', (req, res) => {
  res.json({
    name: pkg.name,
    version: pkg.version,
    bootTime: serverBootTime,
    commit: process.env.GIT_COMMIT || null
  });
});

// Global error handler should be last middleware before server start exports
// Placed near end of file after route definitions.

const PORT = process.env.PORT || 5000;
// Track whether the HTTP server has successfully started listening.
let serverStarted = false;

// Initialize database and start server
const dbModule = require('./db');

// Don't auto-start server in test environment
const shouldAutoStart = process.env.NODE_ENV !== 'test';

(async function initAndStart() {
  if (!shouldAutoStart) {
    // In test mode, just initialize DB without starting server
    try {
      await dbModule.init();
      auditLogger.initializeAuditTables();
      logger.info('Database initialized for testing');
    } catch (e) {
      console.error('Test initialization error:', e);
    }
    return;
  }
  try {
    console.log('[BOOT] Starting database initialization...');
    await dbModule.init();
    console.log('[BOOT] Database initialized successfully');
    
    // Initialize audit tables synchronously after DB is ready
    console.log('[BOOT] Initializing audit tables...');
    auditLogger.initializeAuditTables();
    logger.info('Database and audit tables initialized');
    
    // Seed users before starting services
    console.log('[BOOT] Seeding default users if required...');
    try {
      const existing = listUsers();
      
      // Check and create each default user individually
      const mainPass = process.env.MAIN_ADMIN_PASS || 'mainpass';
      const adminPass = process.env.ADMIN_PASS || 'adminpass';
      const demoPass = process.env.DEMO_USER_PASS || 'testpass';
      const usuarioXPass = process.env.USUARIOX_PASS || 'usuarioX123';
      
      if (!existing.find(u => u.username === 'mainadmin' || u.email === 'main@parkmaprd.local')) {
        const mainHash = await bcrypt.hash(mainPass, 10);
        createUser({ email: 'main@parkmaprd.local', username: 'mainadmin', passwordHash: mainHash, name: 'Main Admin', role: 'main' });
        console.log('✅ Seeded main admin: username=mainadmin, password:', mainPass);
      }
      
      if (!existing.find(u => u.username === 'admin' || u.email === 'admin@parkmaprd.local')) {
        const adminHash = await bcrypt.hash(adminPass, 10);
        createUser({ email: 'admin@parkmaprd.local', username: 'admin', passwordHash: adminHash, name: 'Admin', role: 'admin' });
        console.log('✅ Seeded admin: username=admin, password:', adminPass);
      }
      
      if (!existing.find(u => u.username === 'demo' || u.email === 'demo@parkmaprd.local')) {
        const demoHash = await bcrypt.hash(demoPass, 10);
        createUser({ email: 'demo@parkmaprd.local', username: 'demo', passwordHash: demoHash, name: 'Demo User', licensePlate: 'JKL-012' });
        console.log('✅ Seeded demo user: username=demo, password:', demoPass);
      }
      
      if (!existing.find(u => u.username === 'usuarioX' || u.email === 'usuariox@parkmaprd.local')) {
        const usuarioXHash = await bcrypt.hash(usuarioXPass, 10);
        createUser({ email: 'usuariox@parkmaprd.local', username: 'usuarioX', passwordHash: usuarioXHash, name: 'Usuario X', licensePlate: 'ABC-123' });
        console.log('✅ Seeded usuarioX: username=usuarioX, password:', usuarioXPass);
      }
      
      // Seed parking managers with parking-specific names
      const managerPass = process.env.MANAGER_PASS || 'manager123';
      
      // Get available parkings for assignment
      const db = dbModule.getDb();
      const parkingsStmt = db.prepare('SELECT id, name FROM parkings LIMIT 5');
      const availableParkings = [];
      while (parkingsStmt.step()) {
        availableParkings.push(parkingsStmt.getAsObject());
      }
      parkingsStmt.free();
      
      // Create managers for first 3 parkings
      if (availableParkings.length > 0) {
        for (let i = 0; i < Math.min(3, availableParkings.length); i++) {
          const parking = availableParkings[i];
          const managerUsername = `manager_${parking.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
          const managerEmail = `${managerUsername}@parkmaprd.local`;
          
          if (!existing.find(u => u.username === managerUsername || u.email === managerEmail)) {
            const managerHash = await bcrypt.hash(managerPass, 10);
            const managerUser = createUser({ 
              email: managerEmail, 
              username: managerUsername, 
              passwordHash: managerHash, 
              name: `Manager ${parking.name}`, 
              role: 'parking_manager' 
            });
            
            // Auto-assign to parking
            const assignmentId = `pm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const assignStmt = db.prepare(`
              INSERT INTO parking_managers (id, userId, parkingId, assignedBy, assignedAt, active)
              VALUES (?, ?, ?, ?, ?, 1)
            `);
            assignStmt.bind([assignmentId, managerUser.id, parking.id, 'system', Math.floor(Date.now() / 1000)]);
            assignStmt.step();
            assignStmt.free();
            dbModule.saveDb();
            
            console.log(`✅ Seeded manager: username=${managerUsername}, password=${managerPass}, assigned to: ${parking.name}`);
          }
        }
      }
      
      console.log('[BOOT] User seeding complete.');
    } catch (seedErr) {
      console.error('[BOOT] Seeding error (non-fatal):', seedErr);
    }
    
    // Start auto-checkout manager after database and users are ready
    console.log('[BOOT] Starting auto-checkout manager...');
    autoCheckoutManager.start();
    console.log('[BOOT] Auto-checkout manager started');

    // Wait a tick to ensure all synchronous initialization is complete
    await new Promise(resolve => setImmediate(resolve));

    console.log('[BOOT] Starting HTTP server listen on 0.0.0.0...');
    server.listen(PORT, '0.0.0.0', () => {
      serverStarted = true;
      const addr = server.address();
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`[BOOT] server.address() =`, addr);
      console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🏗️  API endpoints: http://localhost:${PORT}/api/parkmaprd/`);
      logger.info(`Server started on port ${PORT}`);
      auditLogger.logAuditEvent(AUDIT_EVENTS.SYSTEM_START, {
        action: 'server_start',
        metadata: { port: PORT, timestamp: new Date().toISOString(), address: addr }
      });
      console.log('[BOOT] ✅ Server initialization complete and accepting requests');
    });

    // Add error handler to prevent crashes
    server.on('error', (err) => {
      console.error('Server error:', err);
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
        // No cerrar el proceso automáticamente
      }
    });
  } catch (e) {
    console.error('Initialization error:', e);
    if (!serverStarted) {
      console.error('Fatal: server nunca inició el listen. Revisa la configuración y errores previos.');
      // No cerrar el proceso automáticamente
    } else {
      console.error('Non-fatal post-start initialization error; server remains running.');
    }
  }
})();

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');
  ws.isAuthenticated = false;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle authentication
      if (data.type === 'auth' && data.token) {
        try {
          const decoded = jwt.verify(data.token, JWT_SECRET);
          ws.userId = decoded.id;
          ws.isAuthenticated = true;
          ws.send(JSON.stringify({ type: 'auth_success', userId: decoded.id }));
          logger.info('WebSocket authenticated', { userId: decoded.id });
        } catch (err) {
          ws.send(JSON.stringify({ type: 'auth_failed', error: 'Invalid token' }));
          ws.close();
        }
        return;
      }
      
      // Require authentication for all other messages
      if (!ws.isAuthenticated) {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication required' }));
        return;
      }
      
      if (data.type === 'subscribe' && data.userId) {
        // Only allow subscribing to own userId
        if (data.userId !== ws.userId) {
          ws.send(JSON.stringify({ type: 'error', error: 'Unauthorized' }));
          return;
        }
        ws.send(JSON.stringify({ type: 'subscribed', userId: data.userId }));
      }
    } catch (e) {
      console.error('WebSocket message error:', e);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });

  // Send initial ping
  ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
});

// Broadcast notification to specific user
function notifyUser(userId, notification) {
  wss.clients.forEach(client => {
    if (client.userId === userId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'notification', ...notification }));
    }
  });
}

// Broadcast to all connected clients
function broadcast(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Make broadcast functions available to other modules
app.locals.notifyUser = notifyUser;
app.locals.broadcast = broadcast;

// Close server gracefully and wait a moment for handles to drain to avoid libuv assertions on Windows
function closeServer(timeoutMs = 200) {
  return new Promise((resolve, reject) => {
    if (!server) return resolve();
    wss.close(() => {
      server.close((err) => {
        if (err) return reject(err);
        // give libuv a short moment to finish closing handles
        setTimeout(resolve, timeoutMs);
      });
    });
  });
}

// ---- Promotions System ----

// Get active promotions
app.get('/api/parkmaprd/promotions', (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  
  const now = Date.now();
  const stmt = db.prepare(`
    SELECT * FROM promotions 
    WHERE isActive = 1 AND validFrom <= ? AND validUntil >= ? 
    ORDER BY createdAt DESC
  `);
  try {
    stmt.bind([now, now]);
    const promotions = [];
    while (stmt.step()) {
      promotions.push(stmt.getAsObject());
    }
    res.json(promotions);
  } finally {
    stmt.free();
  }
});

// Validate promotion code
const promotionValidateSchema = z.object({
  code: z.string().min(1),
  amount: z.number().positive()
});
app.post('/api/parkmaprd/promotions/validate', authMiddleware(JWT_SECRET), validate(promotionValidateSchema), (req, res) => {
  const { code, amount } = req.validatedBody;
  const { getDb } = require('./db');
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare('SELECT * FROM promotions WHERE code = ? AND isActive = 1 AND validFrom <= ? AND validUntil >= ?');
  stmt.bind([code.toUpperCase(), now, now]);
  if (!stmt.step()) {
    stmt.free();
    return res.status(400).json({ error: 'Código inválido o expirado' });
  }
  const promotion = stmt.getAsObject();
  stmt.free();
  if (promotion.maxUses && promotion.currentUses >= promotion.maxUses) {
    return res.status(400).json({ error: 'Código agotado' });
  }
  const userUsageStmt = db.prepare('SELECT COUNT(*) as count FROM userPromotionUsage WHERE userId = ? AND promotionId = ?');
  userUsageStmt.bind([req.userId, promotion.id]);
  userUsageStmt.step();
  const userUsage = userUsageStmt.getAsObject();
  userUsageStmt.free();
  if (userUsage.count > 0 && promotion.type !== 'LOYALTY') {
    return res.status(400).json({ error: 'Código ya usado' });
  }
  if (promotion.minAmount && amount < promotion.minAmount) {
    return res.status(400).json({ error: `Monto mínimo requerido: $${promotion.minAmount.toFixed(2)}` });
  }
  let discount = 0;
  if (promotion.discountPercent) discount = (amount * promotion.discountPercent) / 100;
  else if (promotion.discountAmount) discount = promotion.discountAmount;
  discount = Math.min(discount, amount);
  res.json({ valid: true, promotion, discount, finalAmount: amount - discount });
});

// Apply promotion
const promotionApplySchema = z.object({
  promotionId: z.string().min(1),
  ticketId: z.string().min(1),
  discountApplied: z.number().nonnegative()
});
app.post('/api/parkmaprd/promotions/apply', authMiddleware(JWT_SECRET), validate(promotionApplySchema), (req, res) => {
  const { promotionId, ticketId, discountApplied } = req.validatedBody;
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  const updateStmt = db.prepare('UPDATE promotions SET currentUses = currentUses + 1 WHERE id = ?');
  updateStmt.bind([promotionId]);
  updateStmt.step();
  updateStmt.free();
  const usageId = 'prom_usage_' + Date.now();
  const usageStmt = db.prepare('INSERT INTO userPromotionUsage (id, userId, promotionId, usedAt, ticketId, discountApplied) VALUES (?,?,?,?,?,?)');
  usageStmt.bind([usageId, req.userId, promotionId, Date.now(), ticketId, discountApplied]);
  usageStmt.step();
  usageStmt.free();
  saveDb();
  res.json({ success: true });
});

// Get user's loyalty points
app.get('/api/parkmaprd/users/me/loyalty', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  
  const stmt = db.prepare('SELECT * FROM loyaltyPoints WHERE userId = ?');
  stmt.bind([req.userId]);
  
  if (stmt.step()) {
    const loyalty = stmt.getAsObject();
    stmt.free();
    
    // Get recent transactions
    const transStmt = db.prepare('SELECT * FROM pointTransactions WHERE userId = ? ORDER BY createdAt DESC LIMIT 10');
    transStmt.bind([req.userId]);
    
    const transactions = [];
    while (transStmt.step()) {
      transactions.push(transStmt.getAsObject());
    }
    transStmt.free();
    
    res.json({ ...loyalty, transactions });
  } else {
    stmt.free();
    res.json({ userId: req.userId, points: 0, totalEarned: 0, transactions: [] });
  }
});

// Award loyalty points
app.post('/api/parkmaprd/users/me/loyalty/award', authMiddleware(JWT_SECRET), (req, res) => {
  const { points, description, ticketId } = req.body;
  
  if (!points || points <= 0) return res.status(400).json({ error: 'Puntos inválidos' });
  
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  // Update or create loyalty record
  const checkStmt = db.prepare('SELECT * FROM loyaltyPoints WHERE userId = ?');
  checkStmt.bind([req.userId]);
  
  if (checkStmt.step()) {
    const updateStmt = db.prepare('UPDATE loyaltyPoints SET points = points + ?, totalEarned = totalEarned + ?, lastUpdated = ? WHERE userId = ?');
    updateStmt.bind([points, points, Date.now(), req.userId]);
    updateStmt.step();
    updateStmt.free();
  } else {
    const insertStmt = db.prepare('INSERT INTO loyaltyPoints (userId, points, totalEarned, lastUpdated) VALUES (?, ?, ?, ?)');
    insertStmt.bind([req.userId, points, points, Date.now()]);
    insertStmt.step();
    insertStmt.free();
  }
  checkStmt.free();
  
  // Record transaction
  const transId = 'pts_' + Date.now();
  const transStmt = db.prepare('INSERT INTO pointTransactions (id, userId, type, points, description, ticketId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
  transStmt.bind([transId, req.userId, 'EARNED', points, description || 'Parking reward', ticketId, Date.now()]);
  transStmt.step();
  transStmt.free();
  
  saveDb();
  res.json({ success: true });
});

// Admin: Create promotion
app.post('/api/parkmaprd/admin/promotions', authMiddleware(JWT_SECRET), requireRoles(['admin','main']), (req, res) => {
  
  const { code, title, description, type, discountPercent, discountAmount, minAmount, maxUses, validFrom, validUntil } = req.body;
  
  if (!code || !title || !type) {
    return res.status(400).json({ error: 'Código, título y tipo son requeridos' });
  }
  
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  const promoId = 'promo_' + Date.now();
  const stmt = db.prepare(`
    INSERT INTO promotions (id, code, title, description, type, discountPercent, discountAmount, minAmount, maxUses, validFrom, validUntil, createdAt) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  try {
    stmt.bind([
      promoId, 
      code.toUpperCase(), 
      title, 
      description || '', 
      type,
      discountPercent || null,
      discountAmount || null,
      minAmount || null,
      maxUses || null,
      validFrom || Date.now(),
      validUntil || (Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      Date.now()
    ]);
    stmt.step();
    stmt.free();
    
    saveDb();
    res.json({ success: true, id: promoId });
  } catch (error) {
    stmt.free();
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'Código ya existe' });
    } else {
      res.status(500).json({ error: 'Error creando promoción' });
    }
  }
});

// ==================== SUPPORT SYSTEM ROUTES ====================

// Get support categories
app.get('/api/parkmaprd/support/categories', (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  
  const stmt = db.prepare('SELECT * FROM support_categories WHERE isActive = 1 ORDER BY sortOrder');
  try {
    const categories = [];
    while (stmt.step()) {
      categories.push(stmt.getAsObject());
    }
    res.json(categories);
  } finally {
    stmt.free();
  }
});

// Create support ticket
app.post('/api/parkmaprd/support/tickets', authMiddleware(JWT_SECRET), (req, res) => {
  const { subject, category, priority, description } = req.body;
  
  if (!subject || !description) {
    return res.status(400).json({ error: 'Subject and description are required' });
  }
  
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  const ticketId = 'ticket_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const now = Date.now();
  
  const stmt = db.prepare(`
    INSERT INTO support_tickets 
    (id, userId, subject, category, priority, status, description, createdAt, updatedAt) 
    VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `);
  
  stmt.bind([
    ticketId, 
    req.userId, 
    subject, 
    category || 'general', 
    priority || 'medium', 
    description, 
    now, 
    now
  ]);
  
  stmt.step();
  stmt.free();
  
  saveDb();
  
  res.json({ 
    success: true, 
    ticketId,
    message: 'Ticket creado exitosamente. Te contactaremos pronto.'
  });
});

// Get user tickets
app.get('/api/parkmaprd/support/tickets', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  
  const stmt = db.prepare(`
    SELECT t.*, 
           (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticketId = t.id) as messageCount
    FROM support_tickets t 
    WHERE t.userId = ? 
    ORDER BY t.createdAt DESC
  `);
  
  try {
    stmt.bind([req.userId]);
    const tickets = [];
    while (stmt.step()) {
      tickets.push(stmt.getAsObject());
    }
    res.json(tickets);
  } finally {
    stmt.free();
  }
});

// Start chat session
app.post('/api/parkmaprd/support/chat/start', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  // Check for existing active session
  const existingStmt = db.prepare('SELECT * FROM chat_sessions WHERE userId = ? AND status = ?');
  existingStmt.bind([req.userId, 'active']);
  
  if (existingStmt.step()) {
    const session = existingStmt.getAsObject();
    existingStmt.free();
    return res.json({ sessionId: session.id, existing: true });
  }
  existingStmt.free();
  
  // Create new session
  const sessionId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const stmt = db.prepare(`
    INSERT INTO chat_sessions 
    (id, userId, status, startedAt) 
    VALUES (?, ?, 'active', ?)
  `);
  
  stmt.bind([sessionId, req.userId, Date.now()]);
  stmt.step();
  stmt.free();
  
  saveDb();
  
  res.json({ sessionId, existing: false });
});

// Get chat messages
app.get('/api/parkmaprd/support/chat/:sessionId/messages', authMiddleware(JWT_SECRET), (req, res) => {
  const { sessionId } = req.params;
  const { getDb } = require('./db');
  const db = getDb();
  
  // Verify session belongs to user
  const sessionStmt = db.prepare('SELECT * FROM chat_sessions WHERE id = ? AND userId = ?');
  sessionStmt.bind([sessionId, req.userId]);
  
  if (!sessionStmt.step()) {
    sessionStmt.free();
    return res.status(404).json({ error: 'Chat session not found' });
  }
  sessionStmt.free();
  
  // Get messages
  const msgStmt = db.prepare(`
    SELECT m.*, CASE WHEN m.senderId = 'system' OR m.senderId = 'bot' THEN m.senderId ELSE u.name END as senderName
    FROM chat_messages m 
    LEFT JOIN users u ON m.senderId = u.id AND m.senderId != 'system' AND m.senderId != 'bot'
    WHERE m.sessionId = ? 
    ORDER BY m.createdAt ASC
  `);
  
  msgStmt.bind([sessionId]);
  
  const messages = [];
  while (msgStmt.step()) {
    messages.push(msgStmt.getAsObject());
  }
  msgStmt.free();
  
  res.json(messages);
});

// Send chat message
app.post('/api/parkmaprd/support/chat/:sessionId/messages', authMiddleware(JWT_SECRET), (req, res) => {
  const { sessionId } = req.params;
  const { message } = req.body;
  
  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  // Verify session
  const sessionStmt = db.prepare('SELECT * FROM chat_sessions WHERE id = ? AND userId = ?');
  sessionStmt.bind([sessionId, req.userId]);
  
  if (!sessionStmt.step()) {
    sessionStmt.free();
    return res.status(404).json({ error: 'Chat session not found' });
  }
  sessionStmt.free();
  
  // Add user message
  const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const msgStmt = db.prepare(`
    INSERT INTO chat_messages 
    (id, sessionId, senderId, message, messageType, createdAt) 
    VALUES (?, ?, ?, ?, 'text', ?)
  `);
  
  msgStmt.bind([messageId, sessionId, req.userId, message.trim(), Date.now()]);
  msgStmt.step();
  msgStmt.free();
  
  saveDb();
  
  // Generate auto-reply
  setTimeout(() => {
    const autoReply = generateAutoReply(message.trim().toLowerCase());
    if (autoReply) {
      const replyId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const replyStmt = db.prepare(`
        INSERT INTO chat_messages 
        (id, sessionId, senderId, message, messageType, createdAt) 
        VALUES (?, ?, 'bot', ?, 'text', ?)
      `);
      
      replyStmt.bind([replyId, sessionId, autoReply, Date.now()]);
      replyStmt.step();
      replyStmt.free();
      saveDb();
    }
  }, 1000 + Math.random() * 2000);
  
  res.json({ success: true, messageId });
});

// Helper function for auto-replies
function generateAutoReply(message) {
  const responses = {
    'hola': '¡Hola! ¿Cómo puedo ayudarte con ParkEasy?',
    'ayuda': 'Estoy aquí para ayudarte. Puedes preguntar sobre reservas, pagos, promociones o cualquier problema técnico.',
    'pago': 'Para problemas de pago, puedes revisar tu historial en "Mi Billetera" o contactar a nuestro equipo de soporte.',
    'reserva': 'Para gestionar tus reservas, ve a la sección "Mis Reservas" donde puedes ver, modificar o cancelar tus reservaciones.',
    'promoción': 'Revisa nuestras promociones activas en la sección "Promociones" para obtener descuentos y puntos de lealtad.',
    'gracias': '¡De nada! ¿Hay algo más en lo que pueda ayudarte?',
    'problema': 'Entiendo que tienes un problema. ¿Podrías darme más detalles para poder ayudarte mejor?'
  };
  
  for (const [key, response] of Object.entries(responses)) {
    if (message.includes(key)) {
      return response;
    }
  }
  
  return 'Entiendo. Si necesitas más ayuda específica, puedo conectarte con uno de nuestros agentes. ¿Te gustaría crear un ticket de soporte?';
}

// ==================== SMART SEARCH ROUTES ====================

// Get all amenities
app.get('/api/parkmaprd/amenities', (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  
  const stmt = db.prepare('SELECT * FROM amenities WHERE isActive = 1 ORDER BY category, name');
  const amenities = [];
  
  while (stmt.step()) {
    amenities.push(stmt.getAsObject());
  }
  stmt.free();
  
  // Group by category
  const grouped = {};
  amenities.forEach(amenity => {
    if (!grouped[amenity.category]) {
      grouped[amenity.category] = [];
    }
    grouped[amenity.category].push(amenity);
  });
  
  res.json(grouped);
});

// Smart search with advanced filters
app.get('/api/parkmaprd/parkings/search', (req, res) => {
  const { 
    lat, lng, radius = 5, 
    amenities = '', 
    priceMin = 0, priceMax = 1000,
    sortBy = 'distance',
    maxResults = 50
  } = req.query;
  
  const { getDb } = require('./db');
  const db = getDb();
  
  let baseQuery = `
    SELECT DISTINCT p.*,
           COUNT(DISTINCT pa.amenityId) as amenityCount,
           GROUP_CONCAT(DISTINCT a.id || ':' || a.name || ':' || a.icon) as amenityList
    FROM parkings p
    LEFT JOIN parking_amenities pa ON p.id = pa.parkingId AND pa.available = 1
    LEFT JOIN amenities a ON pa.amenityId = a.id AND a.isActive = 1
  `;
  
  const conditions = [];
  const params = [];
  
  // Price filter
  if (priceMin > 0 || priceMax < 1000) {
    conditions.push('p.hourlyRate >= ? AND p.hourlyRate <= ?');
    params.push(priceMin, priceMax);
  }
  
  // Availability filter
  conditions.push('p.availableSpots > 0');
  
  // Amenities filter
  const requiredAmenities = amenities ? amenities.split(',').filter(a => a.trim()) : [];
  if (requiredAmenities.length > 0) {
    const amenityPlaceholders = requiredAmenities.map(() => '?').join(',');
    baseQuery += ` 
      WHERE p.id IN (
        SELECT pa2.parkingId 
        FROM parking_amenities pa2 
        WHERE pa2.amenityId IN (${amenityPlaceholders}) AND pa2.available = 1
        GROUP BY pa2.parkingId 
        HAVING COUNT(DISTINCT pa2.amenityId) >= ${requiredAmenities.length}
      )
    `;
    params.unshift(...requiredAmenities);
  }
  
  if (conditions.length > 0) {
    const whereClause = requiredAmenities.length > 0 ? ' AND ' : ' WHERE ';
    baseQuery += whereClause + conditions.join(' AND ');
  }
  
  baseQuery += ' GROUP BY p.id';
  
  // Sorting
  switch (sortBy) {
    case 'price':
      baseQuery += ' ORDER BY p.hourlyRate ASC';
      break;
    case 'rating':
      baseQuery += ' ORDER BY p.rating DESC';
      break;
    case 'amenities':
      baseQuery += ' ORDER BY amenityCount DESC';
      break;
    case 'distance':
    default:
      if (lat && lng) {
        // Add distance calculation
        baseQuery = baseQuery.replace('SELECT DISTINCT p.*,', `
          SELECT DISTINCT p.*,
                 ((p.lat - ?) * (p.lat - ?) + (p.lng - ?) * (p.lng - ?)) as distanceSquared,
        `);
        params.unshift(parseFloat(lat), parseFloat(lat), parseFloat(lng), parseFloat(lng));
        baseQuery += ' ORDER BY distanceSquared ASC';
      } else {
        baseQuery += ' ORDER BY p.name ASC';
      }
      break;
  }
  
  baseQuery += ` LIMIT ${parseInt(maxResults)}`;
  
  const stmt = db.prepare(baseQuery);
  if (params.length > 0) {
    stmt.bind(params);
  }
  
  const results = [];
  while (stmt.step()) {
    const parking = stmt.getAsObject();
    
    // Parse amenities
    if (parking.amenityList) {
      parking.amenities = parking.amenityList.split(',').map(item => {
        const [id, name, icon] = item.split(':');
        return { id, name, icon };
      });
    } else {
      parking.amenities = [];
    }
    
    // Calculate search score
    parking.searchScore = calculateSearchScore(parking, requiredAmenities);
    
    // Calculate actual distance if coordinates provided
    if (lat && lng && parking.lat && parking.lng) {
      parking.distance = calculateDistance(
        parseFloat(lat), parseFloat(lng),
        parking.lat, parking.lng
      );
    }
    
    delete parking.amenityList;
    results.push(parking);
  }
  stmt.free();
  
  res.json(results);
});

// Get search suggestions based on user preferences
app.get('/api/parkmaprd/search/suggestions', authMiddleware(JWT_SECRET), (req, res) => {
  const { lat, lng } = req.query;
  const { getDb } = require('./db');
  const db = getDb();
  
  // Get user preferences
  const prefStmt = db.prepare('SELECT * FROM search_preferences WHERE userId = ?');
  prefStmt.bind([req.userId]);
  
  let userPrefs = null;
  if (prefStmt.step()) {
    userPrefs = prefStmt.getAsObject();
  }
  prefStmt.free();
  
  const suggestions = {
    nearby: [],
    recommended: [],
    popular: [],
    budget: []
  };
  
  // Nearby parkings
  if (lat && lng) {
    const nearbyStmt = db.prepare(`
      SELECT p.*, COUNT(pa.amenityId) as amenityCount
      FROM parkings p
      LEFT JOIN parking_amenities pa ON p.id = pa.parkingId
      WHERE p.availableSpots > 0
      GROUP BY p.id
      ORDER BY ((p.lat - ?) * (p.lat - ?) + (p.lng - ?) * (p.lng - ?)) ASC
      LIMIT 5
    `);
    nearbyStmt.bind([parseFloat(lat), parseFloat(lat), parseFloat(lng), parseFloat(lng)]);
    
    while (nearbyStmt.step()) {
      suggestions.nearby.push(nearbyStmt.getAsObject());
    }
    nearbyStmt.free();
  }
  
  // Budget-friendly
  const budgetStmt = db.prepare(`
    SELECT p.*, COUNT(pa.amenityId) as amenityCount
    FROM parkings p
    LEFT JOIN parking_amenities pa ON p.id = pa.parkingId
    WHERE p.availableSpots > 0 AND p.hourlyRate <= 200
    GROUP BY p.id
    ORDER BY p.hourlyRate ASC
    LIMIT 5
  `);
  
  while (budgetStmt.step()) {
    suggestions.budget.push(budgetStmt.getAsObject());
  }
  budgetStmt.free();
  
  // Popular (highest rated)
  const popularStmt = db.prepare(`
    SELECT p.*, COUNT(pa.amenityId) as amenityCount
    FROM parkings p
    LEFT JOIN parking_amenities pa ON p.id = pa.parkingId
    WHERE p.availableSpots > 0 AND p.rating >= 4.0
    GROUP BY p.id
    ORDER BY p.rating DESC
    LIMIT 5
  `);
  
  while (popularStmt.step()) {
    suggestions.popular.push(popularStmt.getAsObject());
  }
  popularStmt.free();
  
  // Recommended based on user preferences
  if (userPrefs && userPrefs.preferredAmenities) {
    const preferred = JSON.parse(userPrefs.preferredAmenities || '[]');
    if (preferred.length > 0) {
      const placeholders = preferred.map(() => '?').join(',');
      const recStmt = db.prepare(`
        SELECT p.*, COUNT(DISTINCT pa.amenityId) as matchingAmenities
        FROM parkings p
        JOIN parking_amenities pa ON p.id = pa.parkingId
        WHERE p.availableSpots > 0 AND pa.amenityId IN (${placeholders})
        GROUP BY p.id
        HAVING matchingAmenities >= 2
        ORDER BY matchingAmenities DESC
        LIMIT 5
      `);
      recStmt.bind(preferred);
      
      while (recStmt.step()) {
        suggestions.recommended.push(recStmt.getAsObject());
      }
      recStmt.free();
    }
  }
  
  res.json(suggestions);
});

// Save user search preferences
app.post('/api/parkmaprd/search/preferences', authMiddleware(JWT_SECRET), (req, res) => {
  const { preferredAmenities, maxDistance, priceRange, defaultSort, savedFilters } = req.body;
  
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO search_preferences 
    (userId, preferredAmenities, maxDistance, priceRange, defaultSort, savedFilters)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.bind([
    req.userId,
    JSON.stringify(preferredAmenities || []),
    maxDistance || 5.0,
    priceRange || 'any',
    defaultSort || 'distance',
    JSON.stringify(savedFilters || {})
  ]);
  
  stmt.step();
  stmt.free();
  
  saveDb();
  
  res.json({ success: true });
});

// Helper functions for search scoring and distance
function calculateSearchScore(parking, requiredAmenities) {
  let score = 100; // Base score
  
  // Rating bonus
  if (parking.rating) {
    score += parking.rating * 10;
  }
  
  // Amenity matching bonus
  if (requiredAmenities.length > 0 && parking.amenities) {
    const matchingAmenities = parking.amenities.filter(a => 
      requiredAmenities.includes(a.id)
    ).length;
    score += matchingAmenities * 20;
  }
  
  // Availability bonus
  if (parking.availableSpots > 10) {
    score += 15;
  } else if (parking.availableSpots > 5) {
    score += 10;
  }
  
  // Price penalty for expensive parking
  if (parking.hourlyRate > 10) {
    score -= 10;
  } else if (parking.hourlyRate < 5) {
    score += 5;
  }
  
  return Math.round(score);
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}

// ---- Parking Comparison System ----

// Get user's comparison lists
app.get('/api/comparison/lists', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  
  try {
    const stmt = db.prepare('SELECT * FROM comparison_lists WHERE userId = ? ORDER BY updated_at DESC');
    stmt.bind([req.userId]);
    const lists = [];
    while (stmt.step()) {
      lists.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(lists);
  } catch (error) {
    console.error('Error fetching comparison lists:', error);
    res.status(500).json({ error: 'Failed to fetch comparison lists' });
  }
});

// Create a new comparison list
app.post('/api/comparison/lists', authMiddleware(JWT_SECRET), (req, res) => {
  const { name, description } = req.body;
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  try {
    const id = 'comp_list_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const stmt = db.prepare('INSERT INTO comparison_lists (id, userId, name, description) VALUES (?, ?, ?, ?)');
    stmt.bind([id, req.userId, name, description || '']);
    stmt.step();
    stmt.free();
    saveDb();
    
    // Create default criteria
    const defaultCriteria = [
      { name: 'Precio', weight: 0.9, description: 'Relación calidad-precio' },
      { name: 'Ubicación', weight: 0.8, description: 'Proximidad al destino' },
      { name: 'Seguridad', weight: 0.7, description: 'Medidas de seguridad disponibles' },
      { name: 'Facilidades', weight: 0.6, description: 'Amenidades y servicios adicionales' },
      { name: 'Disponibilidad', weight: 0.5, description: 'Espacios disponibles y horarios' }
    ];
    
    const criteriaStmt = db.prepare('INSERT INTO comparison_criteria (id, listId, name, weight, description) VALUES (?, ?, ?, ?, ?)');
    defaultCriteria.forEach(criteria => {
      const criteriaId = 'criteria_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      criteriaStmt.bind([criteriaId, id, criteria.name, criteria.weight, criteria.description]);
      criteriaStmt.step();
      criteriaStmt.reset();
    });
    criteriaStmt.free();
    saveDb();
    
    res.json({ id, name, description, userId: req.userId, created_at: new Date().toISOString() });
  } catch (error) {
    console.error('Error creating comparison list:', error);
    res.status(500).json({ error: 'Failed to create comparison list' });
  }
});

// Get comparison list with items and full parking data
app.get('/api/comparison/lists/:listId', authMiddleware(JWT_SECRET), (req, res) => {
  const { listId } = req.params;
  const { getDb } = require('./db');
  const db = getDb();
  
  try {
    // Get list info
    const listStmt = db.prepare('SELECT * FROM comparison_lists WHERE id = ? AND userId = ?');
    listStmt.bind([listId, req.userId]);
    
    if (!listStmt.step()) {
      listStmt.free();
      return res.status(404).json({ error: 'Comparison list not found' });
    }
    
    const list = listStmt.getAsObject();
    listStmt.free();
    
    // Get criteria
    const criteriaStmt = db.prepare('SELECT * FROM comparison_criteria WHERE listId = ? ORDER BY weight DESC');
    criteriaStmt.bind([listId]);
    const criteria = [];
    while (criteriaStmt.step()) {
      criteria.push(criteriaStmt.getAsObject());
    }
    criteriaStmt.free();
    
    // Get parkings with amenities and scores
    const itemsStmt = db.prepare(`
      SELECT ci.*, p.name, p.address, p.lat, p.lng, p.hourlyRate, p.totalSpots, p.availableSpots,
             p.description, p.images, p.schedule
      FROM comparison_items ci
      JOIN parkings p ON ci.parkingId = p.id
      WHERE ci.listId = ?
      ORDER BY ci.added_at ASC
    `);
    itemsStmt.bind([listId]);
    
    const items = [];
    while (itemsStmt.step()) {
      const item = itemsStmt.getAsObject();
      
      // Get amenities for this parking
      const amenitiesStmt = db.prepare(`
        SELECT a.id, a.name, a.icon, a.category, pa.available
        FROM amenities a
        JOIN parking_amenities pa ON a.id = pa.amenityId
        WHERE pa.parkingId = ?
      `);
      amenitiesStmt.bind([item.parkingId]);
      const amenities = [];
      while (amenitiesStmt.step()) {
        amenities.push(amenitiesStmt.getAsObject());
      }
      amenitiesStmt.free();
      
      // Get scores for this parking
      const scoresStmt = db.prepare('SELECT * FROM comparison_scores WHERE listId = ? AND parkingId = ?');
      scoresStmt.bind([listId, item.parkingId]);
      const scores = [];
      while (scoresStmt.step()) {
        scores.push(scoresStmt.getAsObject());
      }
      scoresStmt.free();
      
      item.amenities = amenities;
      item.scores = scores;
      items.push(item);
    }
    itemsStmt.free();
    
    res.json({
      ...list,
      criteria,
      items
    });
  } catch (error) {
    console.error('Error fetching comparison list:', error);
    res.status(500).json({ error: 'Failed to fetch comparison list' });
  }
});

// Add parking to comparison list
app.post('/api/comparison/lists/:listId/items', authMiddleware(JWT_SECRET), (req, res) => {
  const { listId } = req.params;
  const { parkingId, notes } = req.body;
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  try {
    // Verify ownership
    const listStmt = db.prepare('SELECT * FROM comparison_lists WHERE id = ? AND userId = ?');
    listStmt.bind([listId, req.userId]);
    
    if (!listStmt.step()) {
      listStmt.free();
      return res.status(404).json({ error: 'Comparison list not found' });
    }
    listStmt.free();
    
    // Check if parking already exists in list
    const existsStmt = db.prepare('SELECT * FROM comparison_items WHERE listId = ? AND parkingId = ?');
    existsStmt.bind([listId, parkingId]);
    
    if (existsStmt.step()) {
      existsStmt.free();
      return res.status(409).json({ error: 'Parking already in comparison list' });
    }
    existsStmt.free();
    
    // Add parking to list
    const id = 'comp_item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const stmt = db.prepare('INSERT INTO comparison_items (id, listId, parkingId, notes) VALUES (?, ?, ?, ?)');
    stmt.bind([id, listId, parkingId, notes || '']);
    stmt.step();
    stmt.free();
    
    // Update list timestamp
    const updateStmt = db.prepare('UPDATE comparison_lists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    updateStmt.bind([listId]);
    updateStmt.step();
    updateStmt.free();
    
    saveDb();
    res.json({ id, listId, parkingId, notes, added_at: new Date().toISOString() });
  } catch (error) {
    console.error('Error adding parking to comparison:', error);
    res.status(500).json({ error: 'Failed to add parking to comparison' });
  }
});

// Remove parking from comparison list
app.delete('/api/comparison/lists/:listId/items/:parkingId', authMiddleware(JWT_SECRET), (req, res) => {
  const { listId, parkingId } = req.params;
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  try {
    // Verify ownership
    const listStmt = db.prepare('SELECT * FROM comparison_lists WHERE id = ? AND userId = ?');
    listStmt.bind([listId, req.userId]);
    
    if (!listStmt.step()) {
      listStmt.free();
      return res.status(404).json({ error: 'Comparison list not found' });
    }
    listStmt.free();
    
    // Remove parking and associated scores
    const stmt = db.prepare('DELETE FROM comparison_items WHERE listId = ? AND parkingId = ?');
    stmt.bind([listId, parkingId]);
    stmt.step();
    stmt.free();
    
    const scoresStmt = db.prepare('DELETE FROM comparison_scores WHERE listId = ? AND parkingId = ?');
    scoresStmt.bind([listId, parkingId]);
    scoresStmt.step();
    scoresStmt.free();
    
    saveDb();
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing parking from comparison:', error);
    res.status(500).json({ error: 'Failed to remove parking from comparison' });
  }
});

// Update parking score for a criterion
app.put('/api/comparison/lists/:listId/scores', authMiddleware(JWT_SECRET), (req, res) => {
  const { listId } = req.params;
  const { parkingId, criterionId, score, notes } = req.body;
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  try {
    // Verify ownership
    const listStmt = db.prepare('SELECT * FROM comparison_lists WHERE id = ? AND userId = ?');
    listStmt.bind([listId, req.userId]);
    
    if (!listStmt.step()) {
      listStmt.free();
      return res.status(404).json({ error: 'Comparison list not found' });
    }
    listStmt.free();
    
    // Insert or update score
    const id = 'score_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO comparison_scores 
      (id, listId, parkingId, criterionId, score, notes) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.bind([id, listId, parkingId, criterionId, score, notes || '']);
    stmt.step();
    stmt.free();
    
    saveDb();
    res.json({ success: true, listId, parkingId, criterionId, score, notes });
  } catch (error) {
    console.error('Error updating parking score:', error);
    res.status(500).json({ error: 'Failed to update parking score' });
  }
});

// Get comparison analysis/summary
app.get('/api/comparison/lists/:listId/analysis', authMiddleware(JWT_SECRET), (req, res) => {
  const { listId } = req.params;
  const { getDb } = require('./db');
  const db = getDb();
  
  try {
    // Verify ownership
    const listStmt = db.prepare('SELECT * FROM comparison_lists WHERE id = ? AND userId = ?');
    listStmt.bind([listId, req.userId]);
    
    if (!listStmt.step()) {
      listStmt.free();
      return res.status(404).json({ error: 'Comparison list not found' });
    }
    listStmt.free();
    
    // Get weighted scores for each parking
    const analysisStmt = db.prepare(`
      SELECT 
        ci.parkingId,
        p.name,
        p.hourlyRate,
        AVG(cs.score * cc.weight) as weightedScore,
        COUNT(cs.score) as scoredCriteria,
        (SELECT COUNT(*) FROM comparison_criteria WHERE listId = ?) as totalCriteria
      FROM comparison_items ci
      JOIN parkings p ON ci.parkingId = p.id
      LEFT JOIN comparison_scores cs ON ci.listId = cs.listId AND ci.parkingId = cs.parkingId
      LEFT JOIN comparison_criteria cc ON cs.criterionId = cc.id
      WHERE ci.listId = ?
      GROUP BY ci.parkingId, p.name, p.hourlyRate
      ORDER BY weightedScore DESC NULLS LAST
    `);
    
    analysisStmt.bind([listId, listId]);
    const rankings = [];
    while (analysisStmt.step()) {
      rankings.push(analysisStmt.getAsObject());
    }
    analysisStmt.free();
    
    // Calculate completion percentage
    const completion = rankings.length > 0 && rankings[0].totalCriteria > 0 
      ? Math.round((rankings.reduce((sum, r) => sum + r.scoredCriteria, 0) / (rankings.length * rankings[0].totalCriteria)) * 100)
      : 0;
    
    res.json({
      listId,
      rankings,
      completion,
      totalParkings: rankings.length,
      bestChoice: rankings.find(r => r.weightedScore > 0) || null
    });
  } catch (error) {
    console.error('Error generating comparison analysis:', error);
    res.status(500).json({ error: 'Failed to generate comparison analysis' });
  }
});

// Delete comparison list
app.delete('/api/comparison/lists/:listId', authMiddleware(JWT_SECRET), (req, res) => {
  const { listId } = req.params;
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  try {
    // Verify ownership
    const listStmt = db.prepare('SELECT * FROM comparison_lists WHERE id = ? AND userId = ?');
    listStmt.bind([listId, req.userId]);
    
    if (!listStmt.step()) {
      listStmt.free();
      return res.status(404).json({ error: 'Comparison list not found' });
    }
    listStmt.free();
    
    // Delete list (cascades will handle related data)
    const stmt = db.prepare('DELETE FROM comparison_lists WHERE id = ?');
    stmt.bind([listId]);
    stmt.step();
    stmt.free();
    
    saveDb();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting comparison list:', error);
    res.status(500).json({ error: 'Failed to delete comparison list' });
  }
});

// ---- Auto-Checkout System ----

// Update vehicle position for geolocation tracking
app.post('/api/parkmaprd/auto-checkout/position', authMiddleware(JWT_SECRET), (req, res) => {
  const { lat, lng, accuracy } = req.body;
  
  if (!lat || !lng) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }
  
  autoCheckoutManager.trackVehiclePosition(req.userId, {
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    accuracy: parseFloat(accuracy) || 10
  });
  
  res.json({ success: true, message: 'Position updated' });
});

// Process sensor data for IoT-based checkout
app.post('/api/parkmaprd/auto-checkout/sensor', (req, res) => {
  const { sensorId, vehicleId, action, timestamp, confidence } = req.body;
  
  if (!sensorId || !action) {
    return res.status(400).json({ error: 'Sensor ID and action are required' });
  }
  
  // Store sensor event
  try {
    const { getDb, saveDb } = require('./db');
    const db = getDb();
    
    const eventId = `sensor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stmt = db.prepare(`
      INSERT INTO sensor_events 
      (id, sensorId, eventType, vehicleId, timestamp, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.bind([
      eventId,
      sensorId,
      action,
      vehicleId || null,
      timestamp || Date.now(),
      confidence || 1.0
    ]);
    
    stmt.step();
    stmt.free();
    saveDb();
    
    // Process checkout if it's an exit event
    if (action === 'exit') {
      autoCheckoutManager.processSensorCheckout({
        sensorId,
        vehicleId,
        action,
        timestamp: timestamp || Date.now()
      });
    }
    
    res.json({ success: true, eventId });
    
  } catch (error) {
    console.error('Error processing sensor data:', error);
    res.status(500).json({ error: 'Failed to process sensor data' });
  }
});

// Manual checkout request
app.post('/api/parkmaprd/auto-checkout/manual/:ticketId', authMiddleware(JWT_SECRET), (req, res) => {
  const { ticketId } = req.params;
  
  autoCheckoutManager.processManualCheckout(ticketId, req.userId);
  
  res.json({ success: true, message: 'Manual checkout initiated' });
});

// Get auto-checkout configuration for parking
app.get('/api/parkmaprd/auto-checkout/config/:parkingId', authMiddleware(JWT_SECRET), (req, res) => {
  try {
    const { getDb } = require('./db');
    const db = getDb();
    
    const stmt = db.prepare('SELECT * FROM auto_checkout_config WHERE parkingId = ?');
    stmt.bind([req.params.parkingId]);
    
    if (stmt.step()) {
      const config = stmt.getAsObject();
      config.exitZones = JSON.parse(config.exitZones || '[]');
      config.sensorIds = JSON.parse(config.sensorIds || '[]');
      res.json(config);
    } else {
      res.json({
        parkingId: req.params.parkingId,
        enabled: false,
        method: 'geolocation',
        exitRadius: 100,
        confirmationDelay: 30
      });
    }
    
    stmt.free();
    
  } catch (error) {
    console.error('Error getting checkout config:', error);
    res.status(500).json({ error: 'Failed to get checkout configuration' });
  }
});

// Update auto-checkout configuration (admin only)
app.put('/api/parkmaprd/auto-checkout/config/:parkingId', authMiddleware(JWT_SECRET), (req, res) => {
  const user = findUserById(req.userId);
  if (!user || (user.role !== 'admin' && user.role !== 'main')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const { enabled, method, exitRadius, confirmationDelay, exitZones, sensorIds } = req.body;
  
  try {
    const { getDb, saveDb } = require('./db');
    const db = getDb();
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO auto_checkout_config 
      (parkingId, enabled, method, exitRadius, confirmationDelay, exitZones, sensorIds, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.bind([
      req.params.parkingId,
      enabled ? 1 : 0,
      method || 'geolocation',
      exitRadius || 100,
      confirmationDelay || 30,
      JSON.stringify(exitZones || []),
      JSON.stringify(sensorIds || []),
      Date.now()
    ]);
    
    stmt.step();
    stmt.free();
    saveDb();
    
    // Refresh checkout manager zones
    autoCheckoutManager.initializeCheckoutZones();
    
    res.json({ success: true, message: 'Configuration updated' });
    
  } catch (error) {
    console.error('Error updating checkout config:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// Get checkout history
app.get('/api/parkmaprd/auto-checkout/history', authMiddleware(JWT_SECRET), (req, res) => {
  try {
    const history = autoCheckoutManager.getCheckoutHistory(req.userId, parseInt(req.query.limit) || 20);
    res.json(history);
    
  } catch (error) {
    console.error('Error getting checkout history:', error);
    res.status(500).json({ error: 'Failed to get checkout history' });
  }
});

// Cancel pending checkout
app.post('/api/parkmaprd/auto-checkout/cancel/:checkoutId', authMiddleware(JWT_SECRET), (req, res) => {
  const { reason } = req.body;
  
  autoCheckoutManager.cancelCheckout(req.params.checkoutId, reason || 'user_cancelled');
  
  res.json({ success: true, message: 'Checkout cancelled' });
});

// Get user notifications
app.get('/api/parkmaprd/notifications', authMiddleware(JWT_SECRET), (req, res) => {
  try {
    const { getDb } = require('./db');
    const db = getDb();
    
    const stmt = db.prepare(`
      SELECT * FROM notifications 
      WHERE userId = ? 
      ORDER BY createdAt DESC 
      LIMIT ?
    `);
    
    stmt.bind([req.userId, parseInt(req.query.limit) || 20]);
    
    const notifications = [];
    while (stmt.step()) {
      notifications.push(stmt.getAsObject());
    }
    
    stmt.free();
    res.json(notifications);
    
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Mark notification as read
app.put('/api/parkmaprd/notifications/:id/read', authMiddleware(JWT_SECRET), (req, res) => {
  try {
    const { getDb, saveDb } = require('./db');
    const db = getDb();
    
    const stmt = db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND userId = ?');
    stmt.bind([req.params.id, req.userId]);
    stmt.step();
    stmt.free();
    saveDb();
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// ---- Smart Reminders System ----

// Get user's reminder preferences
app.get('/api/reminders/preferences', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  
  try {
    const stmt = db.prepare('SELECT * FROM reminder_preferences WHERE userId = ?');
    stmt.bind([req.userId]);
    
    if (stmt.step()) {
      const prefs = stmt.getAsObject();
      stmt.free();
      
      // Parse JSON fields
      prefs.reminderTimes = JSON.parse(prefs.reminderTimes || '[15,5]');
      
      res.json(prefs);
    } else {
      stmt.free();
      // Return default preferences if none exist
      res.json({
        userId: req.userId,
        emailEnabled: 1,
        pushEnabled: 1,
        smsEnabled: 0,
        reminderTimes: [15, 5],
        autoExtendEnabled: 0,
        autoExtendDuration: 30,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        timezone: 'America/Santo_Domingo'
      });
    }
  } catch (error) {
    console.error('Error fetching reminder preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Update user's reminder preferences
app.put('/api/reminders/preferences', authMiddleware(JWT_SECRET), (req, res) => {
  const {
    emailEnabled, pushEnabled, smsEnabled, reminderTimes,
    autoExtendEnabled, autoExtendDuration, quietHoursStart,
    quietHoursEnd, timezone
  } = req.body;
  
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO reminder_preferences 
      (userId, emailEnabled, pushEnabled, smsEnabled, reminderTimes, 
       autoExtendEnabled, autoExtendDuration, quietHoursStart, 
       quietHoursEnd, timezone) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.bind([
      req.userId,
      emailEnabled ? 1 : 0,
      pushEnabled ? 1 : 0,
      smsEnabled ? 1 : 0,
      JSON.stringify(reminderTimes || [15, 5]),
      autoExtendEnabled ? 1 : 0,
      autoExtendDuration || 30,
      quietHoursStart || '22:00',
      quietHoursEnd || '07:00',
      timezone || 'America/Santo_Domingo'
    ]);
    
    stmt.step();
    stmt.free();
    saveDb();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating reminder preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Get active reminders for user
app.get('/api/reminders', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  
  try {
    const stmt = db.prepare(`
      SELECT r.*, t.parkingId, t.expiresAt, t.status as ticketStatus,
             p.name as parkingName, p.address as parkingAddress
      FROM reminders r
      JOIN tickets t ON r.ticketId = t.id
      LEFT JOIN parkings p ON t.parkingId = p.id
      WHERE r.userId = ? AND r.status = 'pending'
      ORDER BY r.scheduledFor ASC
    `);
    
    stmt.bind([req.userId]);
    const reminders = [];
    while (stmt.step()) {
      reminders.push(stmt.getAsObject());
    }
    stmt.free();
    
    res.json(reminders);
  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// Create reminder for ticket (called when ticket is created/extended)
app.post('/api/reminders/schedule', authMiddleware(JWT_SECRET), (req, res) => {
  const { ticketId, reminderType = 'expiration' } = req.body;
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  try {
    // Get ticket details
    const ticketStmt = db.prepare('SELECT * FROM tickets WHERE id = ? AND userId = ?');
    ticketStmt.bind([ticketId, req.userId]);
    
    if (!ticketStmt.step()) {
      ticketStmt.free();
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const ticket = ticketStmt.getAsObject();
    ticketStmt.free();
    
    // Get user preferences
    const prefStmt = db.prepare('SELECT * FROM reminder_preferences WHERE userId = ?');
    prefStmt.bind([req.userId]);
    
    const defaultPrefs = {
      emailEnabled: 1,
      pushEnabled: 1,
      reminderTimes: '[15,5]'
    };
    
    const prefs = prefStmt.step() ? prefStmt.getAsObject() : defaultPrefs;
    prefStmt.free();
    
    const reminderTimes = JSON.parse(prefs.reminderTimes || '[15,5]');
    
    // Schedule reminders based on preferences
    const reminderStmt = db.prepare(`
      INSERT INTO reminders 
      (id, userId, ticketId, reminderType, scheduledFor, channel, message, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const expirationTime = parseInt(ticket.expiresAt);
    const createdReminders = [];
    
    reminderTimes.forEach(minutes => {
      const reminderTime = expirationTime - (minutes * 60 * 1000);
      
      // Only schedule if reminder time is in the future
      if (reminderTime > Date.now()) {
        // Schedule push notification if enabled
        if (prefs.pushEnabled) {
          const pushId = 'rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          reminderStmt.bind([
            pushId, req.userId, ticketId, reminderType, reminderTime, 'push',
            `Tu estacionamiento expira en ${minutes} minutos`,
            JSON.stringify({ minutes, ticketId })
          ]);
          reminderStmt.step();
          reminderStmt.reset();
          createdReminders.push({ id: pushId, channel: 'push', minutes });
        }
        
        // Schedule email if enabled (only for 15+ minutes)
        if (prefs.emailEnabled && minutes >= 15) {
          const emailId = 'rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          reminderStmt.bind([
            emailId, req.userId, ticketId, reminderType, reminderTime, 'email',
            'Tu estacionamiento expira pronto - revisa los detalles',
            JSON.stringify({ minutes, ticketId })
          ]);
          reminderStmt.step();
          reminderStmt.reset();
          createdReminders.push({ id: emailId, channel: 'email', minutes });
        }
      }
    });
    
    reminderStmt.free();
    saveDb();
    
    res.json({ success: true, reminders: createdReminders });
  } catch (error) {
    console.error('Error scheduling reminders:', error);
    res.status(500).json({ error: 'Failed to schedule reminders' });
  }
});

// Process pending reminders (called by cron job or periodic task)
app.post('/api/reminders/process', authMiddleware(JWT_SECRET), (req, res) => {
  // This endpoint would typically be secured and called by an admin or cron job
  // For demo purposes, allowing authenticated users to trigger processing
  
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  try {
    const now = Date.now();
    
    // Get all pending reminders that should be sent now
    const stmt = db.prepare(`
      SELECT r.*, t.parkingId, p.name as parkingName, u.email, u.name as userName
      FROM reminders r
      JOIN tickets t ON r.ticketId = t.id
      JOIN users u ON r.userId = u.id
      LEFT JOIN parkings p ON t.parkingId = p.id
      WHERE r.status = 'pending' AND r.scheduledFor <= ?
      ORDER BY r.scheduledFor ASC
      LIMIT 50
    `);
    
    stmt.bind([now]);
    const pendingReminders = [];
    while (stmt.step()) {
      pendingReminders.push(stmt.getAsObject());
    }
    stmt.free();
    
    const processedCount = pendingReminders.length;
    
    // Mark reminders as sent (in real implementation, actually send them)
    if (processedCount > 0) {
      const updateStmt = db.prepare('UPDATE reminders SET status = "sent", sentAt = ? WHERE id = ?');
      const historyStmt = db.prepare(`
        INSERT INTO reminder_history 
        (id, userId, ticketId, reminderType, channel, sentAt, success, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      pendingReminders.forEach(reminder => {
        // Update reminder status
        updateStmt.bind([now, reminder.id]);
        updateStmt.step();
        updateStmt.reset();
        
        // Log to history
        const historyId = 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        historyStmt.bind([
          historyId, reminder.userId, reminder.ticketId,
          reminder.reminderType, reminder.channel, now, 1,
          JSON.stringify({ originalReminderId: reminder.id })
        ]);
        historyStmt.step();
        historyStmt.reset();
      });
      
      updateStmt.free();
      historyStmt.free();
      saveDb();
    }
    
    res.json({ 
      success: true, 
      processedCount,
      reminders: pendingReminders.map(r => ({
        id: r.id,
        channel: r.channel,
        message: r.message,
        parkingName: r.parkingName
      }))
    });
  } catch (error) {
    console.error('Error processing reminders:', error);
    res.status(500).json({ error: 'Failed to process reminders' });
  }
});

// Cancel reminder
app.delete('/api/reminders/:reminderId', authMiddleware(JWT_SECRET), (req, res) => {
  const { reminderId } = req.params;
  const { getDb, saveDb } = require('./db');
  const db = getDb();
  
  try {
    const stmt = db.prepare('UPDATE reminders SET status = "cancelled" WHERE id = ? AND userId = ?');
    stmt.bind([reminderId, req.userId]);
    stmt.step();
    stmt.free();
    
    saveDb();
    res.json({ success: true });
  } catch (error) {
    console.error('Error cancelling reminder:', error);
    res.status(500).json({ error: 'Failed to cancel reminder' });
  }
});

// Get reminder history
app.get('/api/reminders/history', authMiddleware(JWT_SECRET), (req, res) => {
  const { getDb } = require('./db');
  const db = getDb();
  const { limit = 50, offset = 0 } = req.query;
  
  try {
    const stmt = db.prepare(`
      SELECT h.*, p.name as parkingName
      FROM reminder_history h
      LEFT JOIN tickets t ON h.ticketId = t.id
      LEFT JOIN parkings p ON t.parkingId = p.id
      WHERE h.userId = ?
      ORDER BY h.sentAt DESC
      LIMIT ? OFFSET ?
    `);
    
    stmt.bind([req.userId, parseInt(limit), parseInt(offset)]);
    const history = [];
    while (stmt.step()) {
      history.push(stmt.getAsObject());
    }
    stmt.free();
    
    res.json(history);
  } catch (error) {
    console.error('Error fetching reminder history:', error);
    res.status(500).json({ error: 'Failed to fetch reminder history' });
  }
});

// Handle signals gracefully when running the server standalone
process.on('SIGINT', async () => {
  try {
    await closeServer();
  } finally {
    process.exit(0);
  }
});
process.on('SIGTERM', async () => {
  try {
    await closeServer();
  } finally {
    process.exit(0);
  }
});

// Global error handler final middleware
app.use(errorHandler);

// Export the server and a close helper so scripts/tests can shutdown cleanly
// Also export app for testing purposes
module.exports = { app, server: () => server, closeServer };

// Mantener el proceso activo siempre cuando se ejecuta como servidor principal
if (require.main === module) {
  // Mantener el event loop activo con un intervalo que nunca termina
  setInterval(() => {
    // Heartbeat silencioso para mantener el proceso activo
  }, 1000 * 60); // Cada minuto
  console.log('[KEEPALIVE] Backend activo y esperando conexiones...');
}
