const express = require('express');
const { auditLogger, logger, AUDIT_EVENTS } = require('./logging');

const router = express.Router();

// Middleware to check admin role
function requireAdmin(req, res, next) {
  // This would typically check user role from database
  // For now, we'll check if user has admin flag or special admin user ID
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // In a real implementation, you'd query the database for user role
  // For demo purposes, we'll assume userId starting with 'admin_' are admins
  if (!req.userId.startsWith('admin_') && req.userId !== 'admin') {
    auditLogger.logSecurityEvent('unauthorized_admin_access', 'high', {
      userId: req.userId,
      ipAddress: req.audit?.ipAddress,
      attemptedResource: req.path
    });
    
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  
  next();
}

// Get audit logs with filtering
router.get('/audit-logs', requireAdmin, async (req, res) => {
  try {
    const filters = {
      eventType: req.query.eventType,
      userId: req.query.userId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: parseInt(req.query.limit) || 100
    };
    
    const logs = auditLogger.getAuditLogs(filters);
    
    auditLogger.logAuditEvent('audit_logs_viewed', {
      userId: req.userId,
      sessionId: req.audit?.sessionId,
      ipAddress: req.audit?.ipAddress,
      action: 'view_audit_logs',
      metadata: { filters }
    });
    
    res.json({
      logs,
      total: logs.length,
      filters
    });
  } catch (error) {
    logger.error('Failed to retrieve audit logs', { error: error.message, userId: req.userId });
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

// Get security events
router.get('/security-events', requireAdmin, async (req, res) => {
  try {
    const filters = {
      severity: req.query.severity,
      status: req.query.status,
      limit: parseInt(req.query.limit) || 50
    };
    
    const events = auditLogger.getSecurityEvents(filters);
    
    auditLogger.logAuditEvent('security_events_viewed', {
      userId: req.userId,
      sessionId: req.audit?.sessionId,
      ipAddress: req.audit?.ipAddress,
      action: 'view_security_events',
      metadata: { filters }
    });
    
    res.json({
      events,
      total: events.length,
      filters
    });
  } catch (error) {
    logger.error('Failed to retrieve security events', { error: error.message, userId: req.userId });
    res.status(500).json({ error: 'Failed to retrieve security events' });
  }
});

// Export audit logs (sensitive operation)
router.post('/audit-logs/export', requireAdmin, async (req, res) => {
  try {
    const { format = 'json', filters = {} } = req.body;
    
    // Add audit event for data export
    auditLogger.logAuditEvent(AUDIT_EVENTS.DATA_EXPORT, {
      userId: req.userId,
      sessionId: req.audit?.sessionId,
      ipAddress: req.audit?.ipAddress,
      action: 'export_audit_logs',
      metadata: { format, filters }
    });
    
    auditLogger.logSecurityEvent('audit_data_export', 'high', {
      userId: req.userId,
      ipAddress: req.audit?.ipAddress,
      exportFormat: format,
      filters
    });
    
    const logs = auditLogger.getAuditLogs(filters);
    
    if (format === 'csv') {
      // Convert to CSV format
      const headers = ['ID', 'Event Type', 'User ID', 'IP Address', 'Resource', 'Action', 'Result', 'Created At'];
      const csvRows = [headers.join(',')];
      
      logs.forEach(log => {
        const row = [
          log.id,
          log.event_type,
          log.user_id || '',
          log.ip_address || '',
          log.resource || '',
          log.action || '',
          log.result || '',
          log.created_at
        ];
        csvRows.push(row.map(field => `"${field}"`).join(','));
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.csv`);
      res.send(csvRows.join('\n'));
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.json`);
      res.json({
        exportedAt: new Date().toISOString(),
        exportedBy: req.userId,
        filters,
        logs
      });
    }
  } catch (error) {
    logger.error('Failed to export audit logs', { error: error.message, userId: req.userId });
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

// Get audit statistics
router.get('/audit-stats', requireAdmin, async (req, res) => {
  try {
    const { getDb } = require('./db');
    const db = getDb();
    
    // Get statistics
    const stats = {};
    
    // Total events by type
    const eventTypeStmt = db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM audit_logs 
      WHERE created_at >= date('now', '-30 days')
      GROUP BY event_type 
      ORDER BY count DESC
    `);
    
    stats.eventsByType = [];
    while (eventTypeStmt.step()) {
      stats.eventsByType.push(eventTypeStmt.getAsObject());
    }
    eventTypeStmt.free();
    
    // Active sessions
    const activeSessionsStmt = db.prepare(`
      SELECT COUNT(*) as count FROM audit_sessions WHERE is_active = 1
    `);
    activeSessionsStmt.step();
    stats.activeSessions = activeSessionsStmt.getAsObject().count;
    activeSessionsStmt.free();
    
    // Security events by severity
    const securityStmt = db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM security_events 
      WHERE created_at >= date('now', '-7 days')
      GROUP BY severity
    `);
    
    stats.securityEventsBySeverity = [];
    while (securityStmt.step()) {
      stats.securityEventsBySeverity.push(securityStmt.getAsObject());
    }
    securityStmt.free();
    
    // Failed login attempts (last 24h)
    const failedLoginsStmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM audit_logs 
      WHERE event_type = 'failed_login' 
      AND created_at >= datetime('now', '-1 day')
    `);
    failedLoginsStmt.step();
    stats.failedLoginsLast24h = failedLoginsStmt.getAsObject().count;
    failedLoginsStmt.free();
    
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get audit statistics', { error: error.message, userId: req.userId });
    res.status(500).json({ error: 'Failed to get audit statistics' });
  }
});

// Update security event investigation status
router.put('/security-events/:id/investigate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!['pending', 'investigating', 'resolved', 'false_positive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid investigation status' });
    }
    
    const { getDb, saveDb } = require('./db');
    const db = getDb();
    
    const updateStmt = db.prepare(`
      UPDATE security_events 
      SET investigation_status = ?, 
          investigated_by = ?, 
          investigated_at = CURRENT_TIMESTAMP,
          ${status === 'resolved' ? 'resolved_at = CURRENT_TIMESTAMP,' : ''}
          details = json_set(details, '$.investigation_notes', ?)
      WHERE id = ?
    `);
    
    updateStmt.run([status, req.userId, notes || '', id]);
    updateStmt.free();
    saveDb();
    
    auditLogger.logAuditEvent('security_event_investigated', {
      userId: req.userId,
      sessionId: req.audit?.sessionId,
      ipAddress: req.audit?.ipAddress,
      action: 'investigate_security_event',
      metadata: { securityEventId: id, newStatus: status, notes }
    });
    
    res.json({ message: 'Security event updated successfully' });
  } catch (error) {
    logger.error('Failed to update security event', { error: error.message, userId: req.userId });
    res.status(500).json({ error: 'Failed to update security event' });
  }
});

// System health check with logging
router.get('/system-health', requireAdmin, async (req, res) => {
  try {
    const { getDb } = require('./db');
    const fs = require('fs');
    const path = require('path');
    
    const health = {
      timestamp: new Date().toISOString(),
      database: 'unknown',
      logFiles: 'unknown',
      diskSpace: 'unknown'
    };
    
    // Check database
    try {
      const db = getDb();
      const testStmt = db.prepare('SELECT COUNT(*) as count FROM audit_logs');
      testStmt.step();
      const result = testStmt.getAsObject();
      testStmt.free();
      
      health.database = 'healthy';
      health.auditLogCount = result.count;
    } catch (error) {
      health.database = 'error';
      health.databaseError = error.message;
    }
    
    // Check log files
    try {
      const logDir = path.join(__dirname, 'logs');
      if (fs.existsSync(logDir)) {
        const files = fs.readdirSync(logDir);
        health.logFiles = 'healthy';
        health.logFileCount = files.length;
      } else {
        health.logFiles = 'missing_directory';
      }
    } catch (error) {
      health.logFiles = 'error';
      health.logFilesError = error.message;
    }
    
    // Log the health check
    auditLogger.logAuditEvent('system_health_check', {
      userId: req.userId,
      sessionId: req.audit?.sessionId,
      ipAddress: req.audit?.ipAddress,
      action: 'system_health_check',
      metadata: health
    });
    
    res.json(health);
  } catch (error) {
    logger.error('Failed to perform system health check', { error: error.message, userId: req.userId });
    res.status(500).json({ error: 'Failed to perform system health check' });
  }
});

module.exports = router;