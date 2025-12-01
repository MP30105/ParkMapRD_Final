const fs = require('fs');
const path = require('path');
const { getDb, saveDb } = require('./db');

// Logging levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

// Audit event types
const AUDIT_EVENTS = {
  // Authentication events
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  USER_REGISTER: 'user_register',
  PASSWORD_RESET: 'password_reset',
  TOKEN_REFRESH: 'token_refresh',
  
  // Admin events
  ADMIN_LOGIN: 'admin_login',
  USER_ROLE_CHANGE: 'user_role_change',
  SYSTEM_CONFIG_CHANGE: 'system_config_change',
  DATABASE_BACKUP: 'database_backup',
  
  // Business events
  RESERVATION_CREATE: 'reservation_create',
  RESERVATION_CANCEL: 'reservation_cancel',
  PAYMENT_PROCESS: 'payment_process',
  CHECKOUT_AUTO: 'checkout_auto',
  CHECKOUT_MANUAL: 'checkout_manual',
  
  // Security events
  FAILED_LOGIN: 'failed_login',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  DATA_EXPORT: 'data_export',
  BULK_OPERATION: 'bulk_operation'
};

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'INFO';
    this.logDirectory = process.env.LOG_DIR || path.join(__dirname, 'logs');
    this.maxLogFileSize = parseInt(process.env.MAX_LOG_SIZE) || 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = parseInt(process.env.MAX_LOG_FILES) || 10;
    
    // Ensure log directory exists
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  shouldLog(level) {
    const currentLevel = LOG_LEVELS[this.logLevel.toUpperCase()] || LOG_LEVELS.INFO;
    const messageLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    return messageLevel <= currentLevel;
  }

  formatLogEntry(level, message, metadata = {}) {
    return {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      metadata: {
        pid: process.pid,
        environment: process.env.NODE_ENV || 'development',
        ...metadata
      }
    };
  }

  writeToFile(filename, entry) {
    const logFile = path.join(this.logDirectory, filename);
    const logLine = JSON.stringify(entry) + '\n';
    
    try {
      // Check file size and rotate if necessary
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > this.maxLogFileSize) {
          this.rotateLogFile(logFile);
        }
      }
      
      fs.appendFileSync(logFile, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  rotateLogFile(logFile) {
    try {
      const baseFile = path.basename(logFile, '.log');
      const dir = path.dirname(logFile);
      
      // Rotate existing files
      for (let i = this.maxLogFiles - 1; i > 0; i--) {
        const oldFile = path.join(dir, `${baseFile}.${i}.log`);
        const newFile = path.join(dir, `${baseFile}.${i + 1}.log`);
        
        if (fs.existsSync(oldFile)) {
          if (i === this.maxLogFiles - 1) {
            fs.unlinkSync(oldFile); // Delete oldest
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }
      
      // Move current file to .1
      const rotatedFile = path.join(dir, `${baseFile}.1.log`);
      fs.renameSync(logFile, rotatedFile);
    } catch (error) {
      console.error('Failed to rotate log file:', error.message);
    }
  }

  log(level, message, metadata = {}) {
    if (!this.shouldLog(level)) return;
    
    const entry = this.formatLogEntry(level, message, metadata);
    
    // Write to console in development
    if (process.env.NODE_ENV !== 'production') {
      const colorMap = {
        ERROR: '\x1b[31m',   // Red
        WARN: '\x1b[33m',    // Yellow
        INFO: '\x1b[36m',    // Cyan
        DEBUG: '\x1b[35m',   // Magenta
        TRACE: '\x1b[37m'    // White
      };
      
      const color = colorMap[level.toUpperCase()] || '\x1b[0m';
      const reset = '\x1b[0m';
      console.log(`${color}[${entry.timestamp}] ${entry.level}: ${entry.message}${reset}`);
      
      if (Object.keys(entry.metadata).length > 2) { // More than just pid and environment
        console.log(`${color}${JSON.stringify(entry.metadata, null, 2)}${reset}`);
      }
    }
    
    // Write to file
    this.writeToFile('application.log', entry);
    
    // Write errors to separate file
    if (level.toUpperCase() === 'ERROR') {
      this.writeToFile('error.log', entry);
    }
  }

  error(message, metadata = {}) {
    this.log('ERROR', message, metadata);
  }

  warn(message, metadata = {}) {
    this.log('WARN', message, metadata);
  }

  info(message, metadata = {}) {
    this.log('INFO', message, metadata);
  }

  debug(message, metadata = {}) {
    this.log('DEBUG', message, metadata);
  }

  trace(message, metadata = {}) {
    this.log('TRACE', message, metadata);
  }

  // Security-focused logging
  security(event, details = {}) {
    this.error(`SECURITY EVENT: ${event}`, {
      securityEvent: true,
      event,
      ...details
    });
    
    // Also write to security log
    this.writeToFile('security.log', this.formatLogEntry('ERROR', `SECURITY: ${event}`, details));
  }

  // Performance logging
  performance(operation, duration, metadata = {}) {
    this.info(`PERFORMANCE: ${operation} completed in ${duration}ms`, {
      performanceMetric: true,
      operation,
      duration,
      ...metadata
    });
  }
}

class AuditLogger {
  constructor() {
    this.db = null;
  }

  initializeAuditTables() {
    try {
      this.db = getDb();
      
      // Create audit_logs table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          user_id TEXT,
          session_id TEXT,
          ip_address TEXT,
          user_agent TEXT,
          resource TEXT,
          action TEXT,
          old_values TEXT,
          new_values TEXT,
          result TEXT,
          error_message TEXT,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Create indexes separately
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_logs (event_type);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs (user_id);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs (created_at);`);
      
      // Create audit_sessions table for session tracking
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS audit_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT UNIQUE NOT NULL,
          user_id TEXT NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          login_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          logout_at DATETIME,
          last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_active INTEGER DEFAULT 1
        );
      `);
      
      // Create session indexes
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_session_id ON audit_sessions (session_id);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_session_user_id ON audit_sessions (user_id);`);
      
      // Create security_events table for critical security events
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS security_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          severity TEXT DEFAULT 'medium',
          user_id TEXT,
          ip_address TEXT,
          details TEXT,
          investigation_status TEXT DEFAULT 'pending',
          investigated_by TEXT,
          investigated_at DATETIME,
          resolved_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Create security event indexes
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_security_event_type ON security_events (event_type);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_security_severity ON security_events (severity);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_security_created_at ON security_events (created_at);`);
      
      console.log('✅ Audit tables initialized successfully');
      saveDb();
    } catch (error) {
      console.error('❌ Failed to initialize audit tables:', error);
    }
  }

  logAuditEvent(eventType, details = {}) {
    if (!this.db) {
      console.error('Audit database not initialized');
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO audit_logs (
          event_type, user_id, session_id, ip_address, user_agent,
          resource, action, old_values, new_values, result,
          error_message, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        eventType || '',
        details.userId != null ? details.userId : null,
        details.sessionId != null ? details.sessionId : null,
        details.ipAddress != null ? details.ipAddress : null,
        details.userAgent != null ? details.userAgent : null,
        details.resource != null ? details.resource : null,
        details.action != null ? details.action : null,
        details.oldValues != null ? JSON.stringify(details.oldValues) : null,
        details.newValues != null ? JSON.stringify(details.newValues) : null,
        details.result != null ? details.result : 'success',
        details.error != null ? details.error : null,
        details.metadata != null ? JSON.stringify(details.metadata) : null
      ]);

      stmt.free();
      saveDb();
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  logSecurityEvent(eventType, severity = 'medium', details = {}) {
    if (!this.db) {
      console.error('Audit database not initialized');
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO security_events (
          event_type, severity, user_id, ip_address, details
        ) VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run([
        eventType || '',
        severity || 'medium',
        details.userId != null ? details.userId : null,
        details.ipAddress != null ? details.ipAddress : null,
        JSON.stringify(details || {})
      ]);

      stmt.free();
      saveDb();
      
      // Also log to security file
      logger.security(eventType, details);
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  startSession(userId, sessionId, ipAddress, userAgent) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO audit_sessions (
          session_id, user_id, ip_address, user_agent, login_at, last_activity, is_active
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
      `);

      stmt.run([sessionId, userId, ipAddress, userAgent]);
      stmt.free();
      saveDb();

      this.logAuditEvent(AUDIT_EVENTS.USER_LOGIN, {
        userId,
        sessionId,
        ipAddress,
        userAgent,
        action: 'login'
      });
    } catch (error) {
      console.error('Failed to start audit session:', error);
    }
  }

  endSession(sessionId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE audit_sessions 
        SET logout_at = CURRENT_TIMESTAMP, is_active = 0
        WHERE session_id = ?
      `);

      stmt.run([sessionId]);
      stmt.free();
      saveDb();

      this.logAuditEvent(AUDIT_EVENTS.USER_LOGOUT, {
        sessionId,
        action: 'logout'
      });
    } catch (error) {
      console.error('Failed to end audit session:', error);
    }
  }

  updateSessionActivity(sessionId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE audit_sessions 
        SET last_activity = CURRENT_TIMESTAMP
        WHERE session_id = ? AND is_active = 1
      `);

      stmt.run([sessionId]);
      stmt.free();
    } catch (error) {
      // Silent fail for activity updates to avoid spam
    }
  }

  getAuditLogs(filters = {}) {
    try {
      let query = 'SELECT * FROM audit_logs WHERE 1=1';
      const params = [];

      if (filters.eventType) {
        query += ' AND event_type = ?';
        params.push(filters.eventType);
      }

      if (filters.userId) {
        query += ' AND user_id = ?';
        params.push(filters.userId);
      }

      if (filters.startDate) {
        query += ' AND created_at >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        query += ' AND created_at <= ?';
        params.push(filters.endDate);
      }

      query += ' ORDER BY created_at DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      const stmt = this.db.prepare(query);
      stmt.bind(params);

      const logs = [];
      while (stmt.step()) {
        logs.push(stmt.getAsObject());
      }

      stmt.free();
      return logs;
    } catch (error) {
      console.error('Failed to get audit logs:', error);
      return [];
    }
  }

  getSecurityEvents(filters = {}) {
    try {
      let query = 'SELECT * FROM security_events WHERE 1=1';
      const params = [];

      if (filters.severity) {
        query += ' AND severity = ?';
        params.push(filters.severity);
      }

      if (filters.status) {
        query += ' AND investigation_status = ?';
        params.push(filters.status);
      }

      query += ' ORDER BY created_at DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      const stmt = this.db.prepare(query);
      stmt.bind(params);

      const events = [];
      while (stmt.step()) {
        events.push(stmt.getAsObject());
      }

      stmt.free();
      return events;
    } catch (error) {
      console.error('Failed to get security events:', error);
      return [];
    }
  }
}

// Create singleton instances
const logger = new Logger();
const auditLogger = new AuditLogger();

// Audit middleware for Express
function createAuditMiddleware() {
  return (req, res, next) => {
    // Extract session info
    const sessionId = req.sessionId || req.headers['x-session-id'] || `session_${Date.now()}`;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    // Attach audit info to request
    req.audit = {
      sessionId,
      ipAddress,
      userAgent,
      startTime: Date.now()
    };

    // Update session activity if user is authenticated
    if (req.userId && sessionId) {
      auditLogger.updateSessionActivity(sessionId);
    }

    // Override res.json to capture response data for sensitive operations
    const originalJson = res.json;
    res.json = function(data) {
      req.audit.responseData = data;
      req.audit.statusCode = res.statusCode;
      return originalJson.call(this, data);
    };

    // Log completion on response finish
    res.on('finish', () => {
      const duration = Date.now() - req.audit.startTime;
      
      // Log performance for slow requests
      if (duration > 1000) {
        logger.performance(`${req.method} ${req.path}`, duration, {
          statusCode: res.statusCode,
          userId: req.userId
        });
      }

      // Log sensitive operations
      if (req.path.includes('/admin') || req.method === 'DELETE' || 
          (req.method === 'POST' && (req.path.includes('/auth') || req.path.includes('/payment')))) {
        
        auditLogger.logAuditEvent(
          req.method === 'POST' && req.path.includes('/auth/login') ? AUDIT_EVENTS.USER_LOGIN :
          req.method === 'POST' && req.path.includes('/auth/register') ? AUDIT_EVENTS.USER_REGISTER :
          req.method === 'POST' && req.path.includes('/payment') ? AUDIT_EVENTS.PAYMENT_PROCESS :
          `${req.method.toLowerCase()}_${req.path.replace(/\//g, '_')}`,
          {
            userId: req.userId,
            sessionId: req.audit.sessionId,
            ipAddress: req.audit.ipAddress,
            userAgent: req.audit.userAgent,
            resource: req.path,
            action: req.method,
            result: res.statusCode < 400 ? 'success' : 'failure',
            duration,
            metadata: {
              query: req.query,
              params: req.params,
              responseStatus: res.statusCode
            }
          }
        );
      }
    });

    next();
  };
}

module.exports = {
  logger,
  auditLogger,
  createAuditMiddleware,
  LOG_LEVELS,
  AUDIT_EVENTS
};