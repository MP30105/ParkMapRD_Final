const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_FILE = path.join(__dirname, 'data', 'parkmaprd.sqlite');
let SQL = null;
let db = null;

function ensureDataDir() {
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function initDb() {
  console.time('[DB] total_init');
  console.time('[DB] sqljs_init');
  SQL = await initSqlJs();
  console.timeEnd('[DB] sqljs_init');
  ensureDataDir();

  console.time('[DB] load_or_create');
  if (fs.existsSync(DB_FILE)) {
    const buffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(buffer);
    console.log('[DB] Loaded existing sqlite file');
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new in-memory database');
  }
  console.timeEnd('[DB] load_or_create');

  console.time('[DB] create_tables');
  createTables();
  console.timeEnd('[DB] create_tables');

  // Perform essential migrations synchronously, defer heavy/optional ones.
  console.time('[DB] migrate_essential');
  migrateData({ deferHeavy: true });
  console.timeEnd('[DB] migrate_essential');
  saveDb();
  console.timeEnd('[DB] total_init');
  console.log('Database initialized with sql.js');
}

function createTables() {
  // Users
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    username TEXT,
    passwordHash TEXT,
    name TEXT,
    role TEXT DEFAULT 'user',
    emailVerified INTEGER DEFAULT 0,
    emailVerificationToken TEXT,
    passwordResetToken TEXT,
    passwordResetExpires INTEGER,
    stripeCustomerId TEXT
  )`);

  // Cars
  db.run(`CREATE TABLE IF NOT EXISTS cars (
    id TEXT PRIMARY KEY,
    userId TEXT,
    brand TEXT,
    model TEXT,
    plate TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  // Parkings
  db.run(`CREATE TABLE IF NOT EXISTS parkings (
    id TEXT PRIMARY KEY,
    name TEXT,
    lat REAL,
    lng REAL,
    totalSpots INTEGER,
    availableSpots INTEGER,
    securityVideoUrl TEXT,
    hourlyRate INTEGER DEFAULT 100,
    sellsTickets INTEGER DEFAULT 1
  )`);

  // Add hourlyRate column to existing parkings table if it doesn't exist
  try {
    db.run('ALTER TABLE parkings ADD COLUMN hourlyRate INTEGER DEFAULT 100');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add sellsTickets column to existing parkings table if it doesn't exist
  try {
    db.run('ALTER TABLE parkings ADD COLUMN sellsTickets INTEGER DEFAULT 1');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add reservationId column to payments table if it doesn't exist
  try {
    db.run('ALTER TABLE payments ADD COLUMN reservationId TEXT');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Tickets
  db.run(`CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    parkingId TEXT,
    userId TEXT,
    carId TEXT,
    zone TEXT,
    spotNumber INTEGER,
    startTime INTEGER,
    endTime INTEGER,
    status TEXT,
    usedAt INTEGER,
    qrCode TEXT,
    validatedAt INTEGER,
    FOREIGN KEY(parkingId) REFERENCES parkings(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  // Wallets
  db.run(`CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    userId TEXT,
    provider TEXT,
    token TEXT,
    meta TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  // Ratings
  db.run(`CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY,
    parkingId TEXT,
    userId TEXT,
    score INTEGER,
    comment TEXT,
    createdAt INTEGER,
    FOREIGN KEY(parkingId) REFERENCES parkings(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  // Payments
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    userId TEXT,
    parkingId TEXT,
    ticketId TEXT,
    reservationId TEXT,
    amount REAL,
    status TEXT,
    stripePaymentIntentId TEXT,
    stripePaymentMethodId TEXT,
    receiptUrl TEXT,
    createdAt INTEGER,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(ticketId) REFERENCES tickets(id),
    FOREIGN KEY(reservationId) REFERENCES reservations(id)
  )`);

  // Favorites
  db.run(`CREATE TABLE IF NOT EXISTS favorites (
    id TEXT PRIMARY KEY,
    userId TEXT,
    parkingId TEXT,
    createdAt INTEGER,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(parkingId) REFERENCES parkings(id),
    UNIQUE(userId, parkingId)
  )`);

  // Reservations (for advance booking)
  db.run(`CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    userId TEXT,
    parkingId TEXT,
    spotNumber INTEGER,
    startTime INTEGER,
    endTime INTEGER,
    status TEXT DEFAULT 'pending',
    carId TEXT,
    amount REAL,
    createdAt INTEGER,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(parkingId) REFERENCES parkings(id),
    FOREIGN KEY(carId) REFERENCES cars(id)
  )`);

  // Frequent locations
  db.run(`CREATE TABLE IF NOT EXISTS frequentLocations (
    id TEXT PRIMARY KEY,
    userId TEXT,
    parkingId TEXT,
    label TEXT,
    visitCount INTEGER DEFAULT 1,
    lastVisit INTEGER,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(parkingId) REFERENCES parkings(id)
  )`);

  // Ticket extensions
  db.run(`CREATE TABLE IF NOT EXISTS ticketExtensions (
    id TEXT PRIMARY KEY,
    ticketId TEXT,
    addedMinutes INTEGER,
    amount REAL,
    createdAt INTEGER,
    FOREIGN KEY(ticketId) REFERENCES tickets(id)
  )`);

  // Reviews (enhanced ratings with photos)
  db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    parkingId TEXT,
    userId TEXT,
    rating INTEGER,
    comment TEXT,
    photoUrl TEXT,
    securityRating INTEGER,
    cleanlinessRating INTEGER,
    accessibilityRating INTEGER,
    createdAt INTEGER,
    FOREIGN KEY(parkingId) REFERENCES parkings(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  // User preferences
  db.run(`CREATE TABLE IF NOT EXISTS userPreferences (
    userId TEXT PRIMARY KEY,
    theme TEXT DEFAULT 'auto',
    primaryColor TEXT DEFAULT '#06b6d4',
    fontSize TEXT DEFAULT 'medium',
    layoutDensity TEXT DEFAULT 'normal',
    biometricEnabled INTEGER DEFAULT 0,
    autoRenewEnabled INTEGER DEFAULT 0,
    notificationsEnabled INTEGER DEFAULT 1,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  // Security incidents
  db.run(`CREATE TABLE IF NOT EXISTS securityIncidents (
    id TEXT PRIMARY KEY,
    parkingId TEXT,
    userId TEXT,
    type TEXT,
    description TEXT,
    severity TEXT,
    lat REAL,
    lng REAL,
    createdAt INTEGER,
    status TEXT DEFAULT 'open',
    FOREIGN KEY(parkingId) REFERENCES parkings(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  // Onboarding progress
  db.run(`CREATE TABLE IF NOT EXISTS onboardingProgress (
    userId TEXT PRIMARY KEY,
    step INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    lastUpdated INTEGER,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  // Wallet balance
  db.run(`CREATE TABLE IF NOT EXISTS walletBalance (
    userId TEXT PRIMARY KEY,
    balance REAL DEFAULT 0,
    lastUpdated INTEGER,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  // Promotions and discounts
  db.run(`CREATE TABLE IF NOT EXISTS promotions (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE,
    title TEXT,
    description TEXT,
    type TEXT,
    discountPercent REAL,
    discountAmount REAL,
    minAmount REAL,
    maxUses INTEGER,
    currentUses INTEGER DEFAULT 0,
    validFrom INTEGER,
    validUntil INTEGER,
    isActive INTEGER DEFAULT 1,
    createdAt INTEGER,
    UNIQUE(code)
  )`);

  // User promotion usage
  db.run(`CREATE TABLE IF NOT EXISTS userPromotionUsage (
    id TEXT PRIMARY KEY,
    userId TEXT,
    promotionId TEXT,
    usedAt INTEGER,
    ticketId TEXT,
    discountApplied REAL,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(promotionId) REFERENCES promotions(id),
    FOREIGN KEY(ticketId) REFERENCES tickets(id)
  )`);

  // Loyalty points
  db.run(`CREATE TABLE IF NOT EXISTS loyaltyPoints (
    userId TEXT PRIMARY KEY,
    points INTEGER DEFAULT 0,
    totalEarned INTEGER DEFAULT 0,
    lastUpdated INTEGER,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  // Point transactions
  db.run(`CREATE TABLE IF NOT EXISTS pointTransactions (
    id TEXT PRIMARY KEY,
    userId TEXT,
    type TEXT,
    points INTEGER,
    description TEXT,
    ticketId TEXT,
    createdAt INTEGER,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(ticketId) REFERENCES tickets(id)
  )`);

  // Comparison lists
  db.run(`CREATE TABLE IF NOT EXISTS comparison_lists (
    id TEXT PRIMARY KEY,
    userId TEXT,
    name TEXT,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  )`);

  // Comparison items - parkings in a comparison list
  db.run(`CREATE TABLE IF NOT EXISTS comparison_items (
    id TEXT PRIMARY KEY,
    listId TEXT,
    parkingId TEXT,
    notes TEXT,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (listId) REFERENCES comparison_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (parkingId) REFERENCES parkings(id),
    UNIQUE(listId, parkingId)
  )`);

  // Comparison criteria - custom criteria for rating parkings
  db.run(`CREATE TABLE IF NOT EXISTS comparison_criteria (
    id TEXT PRIMARY KEY,
    listId TEXT,
    name TEXT,
    weight REAL DEFAULT 1.0,
    description TEXT,
    FOREIGN KEY (listId) REFERENCES comparison_lists(id) ON DELETE CASCADE
  )`);

  // Comparison scores - user ratings for each parking on each criterion
  db.run(`CREATE TABLE IF NOT EXISTS comparison_scores (
    id TEXT PRIMARY KEY,
    listId TEXT,
    parkingId TEXT,
    criterionId TEXT,
    score INTEGER CHECK (score >= 1 AND score <= 5),
    notes TEXT,
    FOREIGN KEY (listId) REFERENCES comparison_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (parkingId) REFERENCES parkings(id),
    FOREIGN KEY (criterionId) REFERENCES comparison_criteria(id) ON DELETE CASCADE,
    UNIQUE(listId, parkingId, criterionId)
  )`);

  // Smart Reminders Tables
  
  // Reminder preferences - user settings for notifications
  db.run(`CREATE TABLE IF NOT EXISTS reminder_preferences (
    userId TEXT PRIMARY KEY,
    emailEnabled INTEGER DEFAULT 1,
    pushEnabled INTEGER DEFAULT 1,
    smsEnabled INTEGER DEFAULT 0,
    reminderTimes TEXT DEFAULT '[15,5]', -- JSON array of minutes before expiration
    autoExtendEnabled INTEGER DEFAULT 0,
    autoExtendDuration INTEGER DEFAULT 30, -- minutes
    quietHoursStart TEXT DEFAULT '22:00',
    quietHoursEnd TEXT DEFAULT '07:00',
    timezone TEXT DEFAULT 'America/Santo_Domingo',
    FOREIGN KEY (userId) REFERENCES users(id)
  )`);

  // Reminders - scheduled notifications for tickets and reservations
  db.run(`CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    userId TEXT,
    type TEXT, -- 'expiration_warning', 'reservation_start', 'extension_available', etc.
    title TEXT,
    message TEXT,
    scheduledTime INTEGER, -- timestamp when reminder should be sent
    sentAt INTEGER, -- timestamp when reminder was actually sent
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    relatedId TEXT, -- ticket ID, reservation ID, etc.
    channels TEXT, -- JSON array of channels ['email', 'app', 'sms']
    createdAt INTEGER,
    FOREIGN KEY (userId) REFERENCES users(id)
  )`);

  // Notification templates - customizable message templates
  db.run(`CREATE TABLE IF NOT EXISTS notification_templates (
    id TEXT PRIMARY KEY,
    type TEXT, -- 'expiration_15min', 'expiration_5min', 'extension_available', etc.
    channel TEXT, -- 'email', 'push', 'sms'
    subject TEXT,
    content TEXT,
    variables TEXT, -- JSON array of available variables
    isActive INTEGER DEFAULT 1,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
  )`);

  // Reminder history - log of all sent reminders
  db.run(`CREATE TABLE IF NOT EXISTS reminder_history (
    id TEXT PRIMARY KEY,
    userId TEXT,
    reminderId TEXT,
    type TEXT,
    channel TEXT,
    sentAt INTEGER,
    success INTEGER DEFAULT 1,
    errorMessage TEXT,
    metadata TEXT,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (reminderId) REFERENCES reminders(id)
  )`);

  // Auto-checkout configuration per parking
  db.run(`CREATE TABLE IF NOT EXISTS auto_checkout_config (
    parkingId TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1,
    method TEXT DEFAULT 'geolocation' CHECK (method IN ('geolocation', 'sensor', 'hybrid')),
    exitRadius INTEGER DEFAULT 100, -- meters for geolocation
    confirmationDelay INTEGER DEFAULT 30, -- seconds before auto-checkout
    exitZones TEXT DEFAULT '[]', -- JSON array of exit zone coordinates
    sensorIds TEXT DEFAULT '[]', -- JSON array of IoT sensor IDs
    gracePeriod INTEGER DEFAULT 300, -- 5 minutes grace period
    autoChargeEnabled INTEGER DEFAULT 1,
    notificationsEnabled INTEGER DEFAULT 1,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (parkingId) REFERENCES parkings(id)
  )`);

  // Auto-checkout events and history
  db.run(`CREATE TABLE IF NOT EXISTS auto_checkouts (
    id TEXT PRIMARY KEY,
    ticketId TEXT,
    userId TEXT,
    parkingId TEXT,
    method TEXT, -- 'geolocation', 'sensor', 'manual'
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'failed')),
    initiatedAt INTEGER,
    completedAt INTEGER,
    cancelledAt INTEGER,
    finalAmount REAL,
    metadata TEXT, -- JSON with method-specific data
    errorMessage TEXT,
    cancelReason TEXT,
    FOREIGN KEY (ticketId) REFERENCES tickets(id),
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (parkingId) REFERENCES parkings(id)
  )`);

  // Vehicle tracking for geolocation-based checkout
  db.run(`CREATE TABLE IF NOT EXISTS vehicle_positions (
    id TEXT PRIMARY KEY,
    userId TEXT,
    ticketId TEXT,
    lat REAL,
    lng REAL,
    accuracy REAL DEFAULT 10,
    timestamp INTEGER,
    isExitDetection INTEGER DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (ticketId) REFERENCES tickets(id)
  )`);

  // Parking Managers - assign managers to specific parkings
  db.run(`CREATE TABLE IF NOT EXISTS parking_managers (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    parkingId TEXT NOT NULL,
    assignedBy TEXT,
    assignedAt INTEGER DEFAULT (strftime('%s', 'now')),
    active INTEGER DEFAULT 1,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(parkingId) REFERENCES parkings(id),
    FOREIGN KEY(assignedBy) REFERENCES users(id),
    UNIQUE(userId, parkingId)
  )`);

  // Parking Assistants - created by managers, can update vehicle counts
  db.run(`CREATE TABLE IF NOT EXISTS parking_assistants (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    parkingId TEXT NOT NULL,
    createdBy TEXT NOT NULL,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    active INTEGER DEFAULT 1,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(parkingId) REFERENCES parkings(id),
    FOREIGN KEY(createdBy) REFERENCES users(id),
    UNIQUE(userId, parkingId)
  )`);

  // IoT sensor data for sensor-based checkout
  db.run(`CREATE TABLE IF NOT EXISTS sensor_events (
    id TEXT PRIMARY KEY,
    sensorId TEXT,
    parkingId TEXT,
    eventType TEXT CHECK (eventType IN ('entry', 'exit', 'occupancy_change')),
    vehicleId TEXT, -- license plate or vehicle identifier
    spotNumber INTEGER,
    timestamp INTEGER,
    confidence REAL DEFAULT 1.0,
    metadata TEXT, -- JSON with sensor-specific data
    processed INTEGER DEFAULT 0,
    FOREIGN KEY (parkingId) REFERENCES parkings(id)
  )`);

  // Notifications for various events
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    userId TEXT,
    type TEXT, -- 'auto_checkout', 'reminder', 'payment', etc.
    title TEXT,
    message TEXT,
    relatedId TEXT, -- ticket ID, checkout ID, etc.
    read INTEGER DEFAULT 0,
    createdAt INTEGER,
    FOREIGN KEY (userId) REFERENCES users(id)
  )`);
}

function migrateData(options = {}) {
  const deferHeavy = options.deferHeavy;
  // Migrate parkings
  try {
    const result = db.exec('SELECT COUNT(*) as c FROM parkings');
    const count = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
    if (count === 0) {
      const parkFile = path.join(__dirname, 'data', 'parkings.json');
      if (fs.existsSync(parkFile)) {
        const raw = JSON.parse(fs.readFileSync(parkFile, 'utf8'));
        const stmt = db.prepare('INSERT INTO parkings (id,name,lat,lng,totalSpots,availableSpots) VALUES (?,?,?,?,?,?)');
        for (const p of raw || []) {
          stmt.bind([p.id, p.name, p.lat, p.lng, p.totalSpots || 0, p.availableSpots || 0]);
          stmt.step();
          stmt.reset();
        }
      }
    }
  } catch (e) {
    console.error('Failed to migrate parkings.json', e);
  }

  // Create default promotions (essential)
  try {
    const promoResult = db.exec('SELECT COUNT(*) as c FROM promotions');
    const promoCount = promoResult.length > 0 && promoResult[0].values.length > 0 ? promoResult[0].values[0][0] : 0;
    if (promoCount === 0) {
      const now = Date.now();
      const futureDate = now + (30 * 24 * 60 * 60 * 1000); // 30 days from now
      
      const promotions = [
        {
          id: 'promo_welcome_2023',
          code: 'WELCOME20',
          title: 'Bienvenida - 20% OFF',
          description: 'Descuento del 20% para nuevos usuarios en su primera compra',
          type: 'FIRST_TIME',
          discountPercent: 20,
          discountAmount: null,
          minAmount: 200.00,
          maxUses: 1000,
          currentUses: 0,
          validFrom: now,
          validUntil: futureDate,
          isActive: 1,
          createdAt: now
        },
        {
          id: 'promo_early_bird_2023',
          code: 'EARLYBIRD',
          title: 'Madrugador - RD$80 OFF',
          description: 'Descuento de RD$80 para estacionamientos antes de las 8:00 AM',
          type: 'SEASONAL',
          discountPercent: null,
          discountAmount: 80.00,
          minAmount: 120.00,
          maxUses: null,
          currentUses: 0,
          validFrom: now,
          validUntil: futureDate,
          isActive: 1,
          createdAt: now
        },
        {
          id: 'promo_loyalty_2023',
          code: 'LOYAL15',
          title: 'Cliente Fiel - 15% OFF',
          description: '15% de descuento para clientes frecuentes con más de 5 tickets',
          type: 'LOYALTY',
          discountPercent: 15,
          discountAmount: null,
          minAmount: null,
          maxUses: null,
          currentUses: 0,
          validFrom: now,
          validUntil: futureDate,
          isActive: 1,
          createdAt: now
        },
        {
          id: 'promo_weekend_2023',
          code: 'WEEKEND50',
          title: 'Fin de Semana - 50% OFF',
          description: 'Gran descuento para estacionamientos de fin de semana',
          type: 'SEASONAL',
          discountPercent: 50,
          discountAmount: null,
          minAmount: 400.00,
          maxUses: 500,
          currentUses: 23,
          validFrom: now,
          validUntil: futureDate,
          isActive: 1,
          createdAt: now
        }
      ];

      const stmt = db.prepare(`
        INSERT INTO promotions 
        (id, code, title, description, type, discountPercent, discountAmount, minAmount, maxUses, currentUses, validFrom, validUntil, isActive, createdAt) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const promo of promotions) {
        stmt.bind([
          promo.id, promo.code, promo.title, promo.description, promo.type,
          promo.discountPercent, promo.discountAmount, promo.minAmount,
          promo.maxUses, promo.currentUses, promo.validFrom, promo.validUntil,
          promo.isActive, promo.createdAt
        ]);
        stmt.step();
        stmt.reset();
      }
      
      console.log('✅ Default promotions created');
    }
  } catch (e) {
    console.error('Failed to create default promotions', e);
  }

  // Migrate users (essential)
  try {
    const result = db.exec('SELECT COUNT(*) as c FROM users');
    const count = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
    if (count === 0) {
      const userFile = path.join(__dirname, 'data', 'users.json');
      if (fs.existsSync(userFile)) {
        const raw = JSON.parse(fs.readFileSync(userFile, 'utf8'));
        const userStmt = db.prepare('INSERT INTO users (id,email,username,passwordHash,name,role) VALUES (?,?,?,?,?,?)');
        const carStmt = db.prepare('INSERT INTO cars (id,userId,brand,model,plate) VALUES (?,?,?,?,?)');
        const usedCarIds = new Set();
        let carCounter = 0;
        for (const u of raw || []) {
          userStmt.bind([u.id, u.email, u.username || '', u.passwordHash, u.name || '', u.role || 'user']);
          userStmt.step();
          userStmt.reset();
          if (u.cars && Array.isArray(u.cars)) {
            for (const c of u.cars) {
              let cid = c.id;
              // If ID already used or doesn't exist, generate new one
              if (!cid || usedCarIds.has(cid)) {
                cid = 'cmig_' + u.id + '_' + carCounter++;
              }
              usedCarIds.add(cid);
              carStmt.bind([cid, u.id, c.brand || '', c.model || '', c.plate || '']);
              carStmt.step();
              carStmt.reset();
            }
          } else if (u.licensePlate) {
            const cid = 'cmig_' + u.id + '_' + carCounter++;
            usedCarIds.add(cid);
            carStmt.bind([cid, u.id, '', '', u.licensePlate]);
            carStmt.step();
            carStmt.reset();
          }
        }
        console.log('Successfully migrated users.json');
      }
    }
  } catch (e) {
    console.error('Failed to migrate users.json', e);
  }

  // Support system tables (heavy but needed early)
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      description TEXT NOT NULL,
      assignedTo TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      resolvedAt INTEGER,
      FOREIGN KEY (userId) REFERENCES users (id),
      FOREIGN KEY (assignedTo) REFERENCES users (id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      ticketId TEXT NOT NULL,
      userId TEXT NOT NULL,
      message TEXT NOT NULL,
      isStaff INTEGER NOT NULL DEFAULT 0,
      attachments TEXT,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (ticketId) REFERENCES support_tickets (id),
      FOREIGN KEY (userId) REFERENCES users (id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      agentId TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      startedAt INTEGER NOT NULL,
      endedAt INTEGER,
      rating INTEGER,
      feedback TEXT,
      FOREIGN KEY (userId) REFERENCES users (id),
      FOREIGN KEY (agentId) REFERENCES users (id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      senderId TEXT NOT NULL,
      message TEXT NOT NULL,
      messageType TEXT NOT NULL DEFAULT 'text',
      isRead INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (sessionId) REFERENCES chat_sessions (id),
      FOREIGN KEY (senderId) REFERENCES users (id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS support_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      sortOrder INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Create default support categories
  try {
    const catResult = db.exec('SELECT COUNT(*) as c FROM support_categories');
    const catCount = catResult.length > 0 && catResult[0].values.length > 0 ? catResult[0].values[0][0] : 0;
    if (catCount === 0) {
      const categories = [
        { id: 'payment', name: 'Problemas de Pago', description: 'Dificultades con pagos, reembolsos y facturación', sortOrder: 1 },
        { id: 'booking', name: 'Reservas', description: 'Problemas con reservas, cancelaciones y modificaciones', sortOrder: 2 },
        { id: 'technical', name: 'Problemas Técnicos', description: 'Errores en la aplicación, bugs y funcionalidades', sortOrder: 3 },
        { id: 'parking', name: 'Estacionamientos', description: 'Ubicaciones, acceso y condiciones de parqueos', sortOrder: 4 },
        { id: 'account', name: 'Mi Cuenta', description: 'Perfil, configuración y datos personales', sortOrder: 5 },
        { id: 'general', name: 'Consulta General', description: 'Otras consultas y sugerencias', sortOrder: 6 }
      ];

      const stmt = db.prepare('INSERT INTO support_categories (id, name, description, isActive, sortOrder) VALUES (?, ?, ?, 1, ?)');
      categories.forEach(cat => {
        stmt.bind([cat.id, cat.name, cat.description, cat.sortOrder]);
        stmt.step();
        stmt.reset();
      });
    }
  } catch (e) {
    console.error('Failed to create default support categories', e);
  }

  // Smart search amenities tables (structure only)
  db.exec(`
    CREATE TABLE IF NOT EXISTS amenities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      isActive INTEGER NOT NULL DEFAULT 1,
      weight REAL NOT NULL DEFAULT 1.0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS parking_amenities (
      parkingId TEXT NOT NULL,
      amenityId TEXT NOT NULL,
      available INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      PRIMARY KEY (parkingId, amenityId),
      FOREIGN KEY (parkingId) REFERENCES parkings (id),
      FOREIGN KEY (amenityId) REFERENCES amenities (id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS search_preferences (
      userId TEXT PRIMARY KEY,
      preferredAmenities TEXT,
      maxDistance REAL DEFAULT 5.0,
      priceRange TEXT DEFAULT 'any',
      defaultSort TEXT DEFAULT 'distance',
      savedFilters TEXT,
      FOREIGN KEY (userId) REFERENCES users (id)
    )
  `);

  // Create default notification templates (may be large, keep) 
  try {
    const templateResult = db.exec('SELECT COUNT(*) as c FROM notification_templates');
    const templateCount = templateResult.length > 0 && templateResult[0].values.length > 0 ? templateResult[0].values[0][0] : 0;
    if (templateCount === 0) {
      const templates = [
        {
          id: 'exp_15min_push',
          type: 'expiration_15min',
          channel: 'push',
          subject: 'Tu estacionamiento expira pronto',
          content: 'Tu ticket en {{parkingName}} expira en 15 minutos. \u00bfDeseas extender el tiempo?',
          variables: '["parkingName", "expirationTime", "ticketId"]'
        },
        {
          id: 'exp_5min_push',
          type: 'expiration_5min',
          channel: 'push',
          subject: '\u00a1Solo 5 minutos restantes!',
          content: 'Tu ticket en {{parkingName}} expira en 5 minutos. Act\u00faa r\u00e1pido para evitar multas.',
          variables: '["parkingName", "expirationTime", "ticketId"]'
        },
        {
          id: 'exp_15min_email',
          type: 'expiration_15min',
          channel: 'email',
          subject: 'Recordatorio: Tu estacionamiento expira pronto',
          content: 'Hola {{userName}},<br><br>Tu ticket de estacionamiento en <strong>{{parkingName}}</strong> expirar\u00e1 el {{expirationTime}}.<br><br>\u00bfDeseas extender el tiempo de estacionamiento?<br><br>Saludos,<br>ParkMapRD',
          variables: '["userName", "parkingName", "expirationTime", "ticketId"]'
        },
        {
          id: 'extension_available_push',
          type: 'extension_available',
          channel: 'push',
          subject: 'Extensi\u00f3n autom\u00e1tica aplicada',
          content: 'Hemos extendido tu tiempo de estacionamiento en {{parkingName}} por {{duration}} minutos adicionales.',
          variables: '["parkingName", "duration", "newExpirationTime"]'
        },
        {
          id: 'payment_due_email',
          type: 'payment_due',
          channel: 'email',
          subject: 'Pago pendiente - Extensi\u00f3n de estacionamiento',
          content: 'Tu extensi\u00f3n autom\u00e1tica en {{parkingName}} requiere pago. Total: RD${{amount}}.<br><br>Paga ahora para evitar penalizaciones.',
          variables: '["parkingName", "amount", "dueDate"]'
        }
      ];

      const stmt = db.prepare('INSERT INTO notification_templates (id, type, channel, subject, content, variables) VALUES (?, ?, ?, ?, ?, ?)');
      templates.forEach(template => {
        stmt.bind([template.id, template.type, template.channel, template.subject, template.content, template.variables]);
        stmt.step();
        stmt.reset();
      });
      stmt.free();
      
      console.log('Default notification templates created');
    }
  } catch (e) {
    console.error('Failed to create default notification templates', e);
  }

  const heavyTasks = () => {
    console.log('[DB] Starting deferred heavy tasks');
    // Create default amenities
    try {
      const amenityResult = db.exec('SELECT COUNT(*) as c FROM amenities');
      const amenityCount = amenityResult.length > 0 && amenityResult[0].values.length > 0 ? amenityResult[0].values[0][0] : 0;
      if (amenityCount === 0) {
      const amenities = [
        // Safety & Security
        { id: 'cctv', name: 'Cámaras de Seguridad', description: 'Videovigilancia 24/7', icon: '📹', category: 'security', weight: 2.5 },
        { id: 'security_guard', name: 'Guardia de Seguridad', description: 'Personal de seguridad presente', icon: '👮', category: 'security', weight: 3.0 },
        { id: 'lighting', name: 'Iluminación', description: 'Área bien iluminada', icon: '💡', category: 'security', weight: 1.5 },
        { id: 'gated', name: 'Acceso Controlado', description: 'Entrada con barrera o portón', icon: '🚧', category: 'security', weight: 2.0 },
        
        // Weather Protection
        { id: 'covered', name: 'Techado', description: 'Protección contra lluvia y sol', icon: '🏠', category: 'weather', weight: 2.0 },
        { id: 'underground', name: 'Subterráneo', description: 'Estacionamiento bajo tierra', icon: '🕳️', category: 'weather', weight: 1.8 },
        { id: 'shade', name: 'Sombra Natural', description: 'Árboles o sombra natural', icon: '🌳', category: 'weather', weight: 1.2 },
        
        // Accessibility
        { id: 'wheelchair', name: 'Accesible', description: 'Espacios para personas con discapacidad', icon: '♿', category: 'accessibility', weight: 3.0 },
        { id: 'wide_spaces', name: 'Espacios Amplios', description: 'Espacios más grandes para SUVs', icon: '🚐', category: 'accessibility', weight: 1.5 },
        { id: 'ground_level', name: 'Nivel de Suelo', description: 'Sin escaleras ni rampas', icon: '🚶', category: 'accessibility', weight: 1.3 },
        
        // Services
        { id: 'valet', name: 'Servicio Valet', description: 'Personal que estaciona tu vehículo', icon: '🤵', category: 'services', weight: 2.5 },
        { id: 'car_wash', name: 'Lavado de Auto', description: 'Servicio de limpieza de vehículos', icon: '🧽', category: 'services', weight: 1.8 },
        { id: 'charging', name: 'Carga Eléctrica', description: 'Estaciones de carga para vehículos eléctricos', icon: '🔌', category: 'services', weight: 2.2 },
        { id: 'air_pump', name: 'Inflado de Neumáticos', description: 'Servicio de aire para llantas', icon: '⚡', category: 'services', weight: 1.0 },
        
        // Convenience
        { id: 'near_entrance', name: 'Cerca de Entrada', description: 'Espacios cercanos a la entrada principal', icon: '🚪', category: 'convenience', weight: 1.5 },
        { id: 'easy_access', name: 'Fácil Acceso', description: 'Entrada y salida sin complicaciones', icon: '➡️', category: 'convenience', weight: 1.3 },
        { id: 'restroom', name: 'Baños', description: 'Sanitarios disponibles', icon: '🚻', category: 'convenience', weight: 1.2 },
        { id: 'atm', name: 'Cajero Automático', description: 'ATM en las instalaciones', icon: '🏧', category: 'convenience', weight: 0.8 }
      ];

      const stmt = db.prepare('INSERT INTO amenities (id, name, description, icon, category, isActive, weight) VALUES (?, ?, ?, ?, ?, 1, ?)');
      amenities.forEach(amenity => {
        stmt.bind([amenity.id, amenity.name, amenity.description, amenity.icon, amenity.category, amenity.weight]);
        stmt.step();
        stmt.reset();
      });
      
      stmt.free();
        console.log('Default amenities created');
      }
    } catch (e) {
      console.error('Failed to create default amenities', e);
    }

    // Assign random amenities to existing parkings
    try {
      const parkingResult = db.exec('SELECT id FROM parkings');
      if (parkingResult.length > 0 && parkingResult[0].values.length > 0) {
      const amenityIds = ['cctv', 'security_guard', 'lighting', 'covered', 'wheelchair', 'easy_access', 'near_entrance', 'charging'];
      
      const stmt = db.prepare('INSERT OR IGNORE INTO parking_amenities (parkingId, amenityId, available) VALUES (?, ?, 1)');
      
      parkingResult[0].values.forEach(row => {
        const parkingId = row[0];
        // Randomly assign 2-5 amenities to each parking
        const numAmenities = Math.floor(Math.random() * 4) + 2; // 2-5 amenities
        const shuffled = [...amenityIds].sort(() => 0.5 - Math.random());
        const selectedAmenities = shuffled.slice(0, numAmenities);
        
        selectedAmenities.forEach(amenityId => {
          stmt.bind([parkingId, amenityId]);
          stmt.step();
          stmt.reset();
        });
      });
      
      stmt.free();
        console.log('Amenities assigned to existing parkings');
      }
    } catch (e) {
      console.error('Failed to assign amenities to parkings', e);
    }

    // Create default auto-checkout configurations
    try {
      const configResult = db.exec('SELECT COUNT(*) as c FROM auto_checkout_config');
      const configCount = configResult.length > 0 && configResult[0].values.length > 0 ? configResult[0].values[0][0] : 0;
      if (configCount === 0) {
      // Enable auto-checkout for some sample parkings
      const defaultConfigs = [
        {
          parkingId: 'park1',
          enabled: 1,
          method: 'geolocation',
          exitRadius: 150,
          confirmationDelay: 30,
          exitZones: JSON.stringify([]),
          sensorIds: JSON.stringify([]),
          gracePeriod: 300,
          autoChargeEnabled: 1,
          notificationsEnabled: 1
        },
        {
          parkingId: 'park2',
          enabled: 1,
          method: 'hybrid',
          exitRadius: 100,
          confirmationDelay: 45,
          exitZones: JSON.stringify([]),
          sensorIds: JSON.stringify(['sensor_park2_exit1', 'sensor_park2_exit2']),
          gracePeriod: 300,
          autoChargeEnabled: 1,
          notificationsEnabled: 1
        },
        {
          parkingId: 'park3',
          enabled: 1,
          method: 'geolocation',
          exitRadius: 120,
          confirmationDelay: 60,
          exitZones: JSON.stringify([]),
          sensorIds: JSON.stringify([]),
          gracePeriod: 600,
          autoChargeEnabled: 1,
          notificationsEnabled: 1
        }
      ];

      const stmt = db.prepare(`
        INSERT INTO auto_checkout_config 
        (parkingId, enabled, method, exitRadius, confirmationDelay, exitZones, sensorIds, gracePeriod, autoChargeEnabled, notificationsEnabled, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const now = Date.now();
      defaultConfigs.forEach(config => {
        stmt.bind([
          config.parkingId,
          config.enabled,
          config.method,
          config.exitRadius,
          config.confirmationDelay,
          config.exitZones,
          config.sensorIds,
          config.gracePeriod,
          config.autoChargeEnabled,
          config.notificationsEnabled,
          now,
          now
        ]);
        stmt.step();
        stmt.reset();
      });
      
      stmt.free();
        console.log('Default auto-checkout configurations created');
      }
    } catch (e) {
      console.error('Failed to create default auto-checkout configurations', e);
    }

    // Create sample notification templates (second batch) if still empty after first set
    try {
      const templateResult2 = db.exec('SELECT COUNT(*) as c FROM notification_templates');
      const templateCount2 = templateResult2.length > 0 && templateResult2[0].values.length > 0 ? templateResult2[0].values[0][0] : 0;
      if (templateCount2 === 0) {
      const templates = [
        {
          id: 'auto_checkout_completed',
          type: 'auto_checkout',
          channel: 'app',
          subject: 'Auto-checkout Completado',
          content: 'Tu vehículo ha salido de {{parkingName}}. Tiempo total: {{duration}}. Monto final: ${{amount}}',
          variables: JSON.stringify(['parkingName', 'duration', 'amount', 'zone', 'spotNumber']),
          isActive: 1
        },
        {
          id: 'auto_checkout_failed',
          type: 'auto_checkout',
          channel: 'app',
          subject: 'Error en Auto-checkout',
          content: 'Hubo un problema procesando tu auto-checkout en {{parkingName}}. Por favor, verifica tu ticket.',
          variables: JSON.stringify(['parkingName', 'errorReason']),
          isActive: 1
        },
        {
          id: 'checkout_confirmation',
          type: 'auto_checkout',
          channel: 'app',
          subject: 'Confirma tu Salida',
          content: '¿Has salido de {{parkingName}}? Tu auto-checkout se procesará en {{delay}} segundos.',
          variables: JSON.stringify(['parkingName', 'delay']),
          isActive: 1
        }
      ];

      const stmt = db.prepare(`
        INSERT INTO notification_templates 
        (id, type, channel, subject, content, variables, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const now = Date.now();
      templates.forEach(template => {
        stmt.bind([
          template.id,
          template.type,
          template.channel,
          template.subject,
          template.content,
          template.variables,
          template.isActive,
          now,
          now
        ]);
        stmt.step();
        stmt.reset();
      });
      
      stmt.free();
        console.log('Default notification templates created (deferred batch)');
      }
    } catch (e) {
      console.error('Failed to create deferred notification templates', e);
    }

    saveDb();
    console.log('[DB] Deferred heavy tasks complete');
  };

  if (deferHeavy) {
    setTimeout(heavyTasks, 0);
  } else {
    heavyTasks();
  }

  console.log('Database initialized successfully (essential migrations)');
}

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buffer);
}

// Wrapper to provide better-sqlite3 compatible API for sql.js
function getDatabase() {
  return {
    // Emulate better-sqlite3's prepare().all() and prepare().get() API
    prepare: (sql) => {
      return {
        all: (...params) => {
          try {
            const stmt = db.prepare(sql);
            if (params.length > 0) {
              stmt.bind(params);
            }
            const results = [];
            while (stmt.step()) {
              const row = stmt.getAsObject();
              results.push(row);
            }
            stmt.free();
            return results;
          } catch (e) {
            console.error('SQL Error in all():', sql, params, e);
            return [];
          }
        },
        get: (...params) => {
          try {
            const stmt = db.prepare(sql);
            if (params.length > 0) {
              stmt.bind(params);
            }
            let result = null;
            if (stmt.step()) {
              result = stmt.getAsObject();
            }
            stmt.free();
            return result;
          } catch (e) {
            console.error('SQL Error in get():', sql, params, e);
            return null;
          }
        },
        run: (...params) => {
          try {
            const stmt = db.prepare(sql);
            if (params.length > 0) {
              stmt.bind(params);
            }
            stmt.step();
            stmt.free();
            return { changes: db.getRowsModified() };
          } catch (e) {
            console.error('SQL Error in run():', sql, params, e);
            return { changes: 0 };
          }
        }
      };
    },
    // Direct exec for simple statements
    exec: (sql) => db.exec(sql),
    // Get rows modified
    getRowsModified: () => db.getRowsModified()
  };
}

module.exports = {
  init: initDb,
  getDb: () => db,
  getDatabase: getDatabase,
  saveDb: saveDb
};
