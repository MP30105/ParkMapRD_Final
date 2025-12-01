const { getDb, saveDb } = require('./db');

class AutoCheckoutManager {
  constructor() {
    this.activeZones = new Map(); // parkingId -> zone config
    this.vehicleTracking = new Map(); // userId -> vehicle position history
    this.checkoutQueue = new Set(); // pending checkouts
    this.processors = {
      geolocation: this.checkForGeolocationCheckout.bind(this),
      sensor: this.processSensorCheckout.bind(this),
      manual: this.processManualCheckout.bind(this)
    };
  }

  // Initialize checkout zones for parkings
  initializeCheckoutZones() {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        SELECT p.*, ac.* 
        FROM parkings p 
        LEFT JOIN auto_checkout_config ac ON p.id = ac.parkingId 
        WHERE ac.enabled = 1
      `);
      
      while (stmt.step()) {
        const row = stmt.getAsObject();
        this.activeZones.set(row.id, {
          parkingId: row.id,
          method: row.method || 'geolocation',
          exitRadius: row.exitRadius || 100, // meters
          confirmationDelay: row.confirmationDelay || 30, // seconds
          exitZones: JSON.parse(row.exitZones || '[]'),
          sensorIds: JSON.parse(row.sensorIds || '[]')
        });
      }
      
      stmt.free();
      console.log(`Initialized ${this.activeZones.size} auto-checkout zones`);
    } catch (error) {
      console.error('Error initializing checkout zones:', error);
    }
  }

  // Track vehicle position for geolocation-based checkout
  trackVehiclePosition(userId, position) {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('Valid user ID is required');
    }
    
    this.validatePositionData(position);
    
    if (!this.vehicleTracking.has(userId)) {
      this.vehicleTracking.set(userId, []);
    }
    
    const history = this.vehicleTracking.get(userId);
    history.push({
      lat: position.latitude,
      lng: position.longitude,
      timestamp: position.timestamp || Date.now(),
      accuracy: position.accuracy || 10
    });
    
    // Keep only last 50 positions
    if (history.length > 50) {
      history.shift();
    }
    
    // Check for potential checkouts
    this.checkForGeolocationCheckout(userId);
  }

  // Check if user has left a parking area
  checkForGeolocationCheckout(userId) {
    try {
      const db = getDb();
      
      // Get active tickets for user
      const ticketStmt = db.prepare(`
        SELECT t.*, p.lat as parkingLat, p.lng as parkingLng, p.name as parkingName
        FROM tickets t 
        JOIN parkings p ON t.parkingId = p.id
        WHERE t.userId = ? AND t.status = 'active'
      `);
      ticketStmt.bind([userId]);
      
      const activeTickets = [];
      while (ticketStmt.step()) {
        activeTickets.push(ticketStmt.getAsObject());
      }
      ticketStmt.free();
      
      if (activeTickets.length === 0) return;
      
      const positions = this.vehicleTracking.get(userId) || [];
      if (positions.length < 3) return; // Need minimum position history
      
      // Check each active ticket
      activeTickets.forEach(ticket => {
        const zoneConfig = this.activeZones.get(ticket.parkingId);
        if (!zoneConfig || zoneConfig.method !== 'geolocation') return;
        
        const isOutsideZone = this.isVehicleOutsideZone(
          positions, 
          ticket.parkingLat, 
          ticket.parkingLng, 
          zoneConfig.exitRadius
        );
        
        if (isOutsideZone) {
          this.initiateCheckout(ticket, 'geolocation', {
            exitPosition: positions[positions.length - 1],
            confirmationDelay: zoneConfig.confirmationDelay
          });
        }
      });
      
    } catch (error) {
      console.error('Error checking geolocation checkout:', error);
    }
  }

  // Check if vehicle is outside parking zone
  isVehicleOutsideZone(positions, parkingLat, parkingLng, exitRadius) {
    if (positions.length < 3) return false;
    
    // Check last 3 positions to confirm exit
    const recentPositions = positions.slice(-3);
    const allOutside = recentPositions.every(pos => {
      const distance = this.calculateDistance(
        pos.lat, pos.lng, 
        parkingLat, parkingLng
      );
      return distance > exitRadius;
    });
    
    // Also check if there was a clear movement pattern (inside -> outside)
    if (allOutside && positions.length >= 5) {
      const earlierPositions = positions.slice(-5, -3);
      const wasInside = earlierPositions.some(pos => {
        const distance = this.calculateDistance(
          pos.lat, pos.lng, 
          parkingLat, parkingLng
        );
        return distance <= exitRadius;
      });
      
      return wasInside; // Only trigger if was inside and now outside
    }
    
    return false;
  }

  // Calculate distance between two points (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  // Process sensor-based checkout
  processSensorCheckout(sensorData) {
    try {
      const { sensorId, vehicleId, action, timestamp } = sensorData;
      
      if (action !== 'exit') return;
      
      const db = getDb();
      
      // Find parking by sensor
      const parkingStmt = db.prepare(`
        SELECT p.*, ac.* 
        FROM parkings p 
        JOIN auto_checkout_config ac ON p.id = ac.parkingId
        WHERE ac.sensorIds LIKE ?
      `);
      parkingStmt.bind([`%"${sensorId}"%`]);
      
      if (!parkingStmt.step()) {
        parkingStmt.free();
        return;
      }
      
      const parking = parkingStmt.getAsObject();
      parkingStmt.free();
      
      // Find active ticket for vehicle/parking
      const ticketStmt = db.prepare(`
        SELECT t.*, u.licensePlate
        FROM tickets t 
        JOIN users u ON t.userId = u.id
        WHERE t.parkingId = ? AND t.status = 'active' 
        AND (u.licensePlate = ? OR t.spotNumber = ?)
        ORDER BY t.startTime DESC LIMIT 1
      `);
      ticketStmt.bind([parking.parkingId, vehicleId, vehicleId]);
      
      if (ticketStmt.step()) {
        const ticket = ticketStmt.getAsObject();
        this.initiateCheckout(ticket, 'sensor', {
          sensorId,
          vehicleId,
          timestamp: timestamp || Date.now()
        });
      }
      
      ticketStmt.free();
      
    } catch (error) {
      console.error('Error processing sensor checkout:', error);
    }
  }

  // Process manual checkout request
  processManualCheckout(ticketId, userId) {
    try {
      const db = getDb();
      
      const ticketStmt = db.prepare(`
        SELECT t.*, p.name as parkingName 
        FROM tickets t 
        JOIN parkings p ON t.parkingId = p.id
        WHERE t.id = ? AND t.userId = ? AND t.status = 'active'
      `);
      ticketStmt.bind([ticketId, userId]);
      
      if (ticketStmt.step()) {
        const ticket = ticketStmt.getAsObject();
        this.initiateCheckout(ticket, 'manual', {
          requestedBy: userId,
          timestamp: Date.now()
        });
      }
      
      ticketStmt.free();
      
    } catch (error) {
      console.error('Error processing manual checkout:', error);
    }
  }

  // Initiate checkout process
  initiateCheckout(ticket, method, metadata) {
    const checkoutId = `checkout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const db = getDb();
      
      // Create checkout record
      const stmt = db.prepare(`
        INSERT INTO auto_checkouts 
        (id, ticketId, userId, parkingId, method, metadata, status, initiatedAt)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `);
      
      stmt.bind([
        checkoutId,
        ticket.id,
        ticket.userId,
        ticket.parkingId,
        method,
        JSON.stringify(metadata),
        Date.now()
      ]);
      
      stmt.step();
      stmt.free();
      saveDb();
      
      // Schedule confirmation or immediate processing
      if (metadata.confirmationDelay && metadata.confirmationDelay > 0) {
        setTimeout(() => {
          this.processCheckoutConfirmation(checkoutId);
        }, metadata.confirmationDelay * 1000);
      } else {
        this.processCheckoutConfirmation(checkoutId);
      }
      
      console.log(`Initiated ${method} checkout for ticket ${ticket.id}`);
      
    } catch (error) {
      console.error('Error initiating checkout:', error);
    }
  }

  // Process checkout confirmation
  async processCheckoutConfirmation(checkoutId) {
    try {
      const db = getDb();
      
      // Get checkout details
      const checkoutStmt = db.prepare(`
        SELECT ac.*, t.*, p.name as parkingName
        FROM auto_checkouts ac
        JOIN tickets t ON ac.ticketId = t.id
        JOIN parkings p ON ac.parkingId = p.id
        WHERE ac.id = ? AND ac.status = 'pending'
      `);
      checkoutStmt.bind([checkoutId]);
      
      if (!checkoutStmt.step()) {
        checkoutStmt.free();
        return;
      }
      
      const checkout = checkoutStmt.getAsObject();
      checkoutStmt.free();
      
      // Calculate final amount and process checkout
      const endTime = Date.now();
      const duration = (endTime - checkout.startTime) / (1000 * 60); // minutes
      const rate = 100; // RD$100 per hour
      const totalAmount = Math.ceil(duration / 60 * rate * 100) / 100; // Round up to nearest centavo
      
      // Update ticket status
      const updateTicketStmt = db.prepare(`
        UPDATE tickets 
        SET status = 'completed', usedAt = ?, actualEndTime = ?, finalAmount = ?
        WHERE id = ?
      `);
      updateTicketStmt.bind([endTime, endTime, totalAmount, checkout.ticketId]);
      updateTicketStmt.step();
      updateTicketStmt.free();
      
      // Update checkout status
      const updateCheckoutStmt = db.prepare(`
        UPDATE auto_checkouts 
        SET status = 'completed', completedAt = ?, finalAmount = ?
        WHERE id = ?
      `);
      updateCheckoutStmt.bind([endTime, totalAmount, checkoutId]);
      updateCheckoutStmt.step();
      updateCheckoutStmt.free();
      
      // Create notification
      await this.createCheckoutNotification(checkout, totalAmount, duration);
      
      saveDb();
      
      console.log(`Completed auto-checkout for ticket ${checkout.ticketId}, amount: $${totalAmount}`);
      
    } catch (error) {
      console.error('Error processing checkout confirmation:', error);
      
      // Mark checkout as failed
      const db = getDb();
      const failStmt = db.prepare(`
        UPDATE auto_checkouts 
        SET status = 'failed', errorMessage = ?
        WHERE id = ?
      `);
      failStmt.bind([error.message, checkoutId]);
      failStmt.step();
      failStmt.free();
      saveDb();
    }
  }

  // Create checkout notification
  async createCheckoutNotification(checkout, amount, duration) {
    try {
      const db = getDb();
      
      const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const stmt = db.prepare(`
        INSERT INTO notifications 
        (id, userId, type, title, message, relatedId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      const title = '🚗 Auto-checkout Completado';
      const message = `Tu vehículo ha salido de ${checkout.parkingName}. Tiempo total: ${Math.round(duration)} minutos. Monto final: $${amount}`;
      
      stmt.bind([
        notificationId,
        checkout.userId,
        'auto_checkout',
        title,
        message,
        checkout.ticketId,
        Date.now()
      ]);
      
      stmt.step();
      stmt.free();
      
    } catch (error) {
      console.error('Error creating checkout notification:', error);
    }
  }

  // Cancel pending checkout
  cancelCheckout(checkoutId, reason = 'user_cancelled') {
    try {
      const db = getDb();
      
      const stmt = db.prepare(`
        UPDATE auto_checkouts 
        SET status = 'cancelled', cancelledAt = ?, cancelReason = ?
        WHERE id = ? AND status = 'pending'
      `);
      
      stmt.bind([Date.now(), reason, checkoutId]);
      stmt.step();
      stmt.free();
      saveDb();
      
      console.log(`Cancelled checkout ${checkoutId}: ${reason}`);
      
    } catch (error) {
      console.error('Error cancelling checkout:', error);
    }
  }

  // Get checkout history for user
  getCheckoutHistory(userId, limit = 20) {
    try {
      const db = getDb();
      
      const stmt = db.prepare(`
        SELECT ac.*, p.name as parkingName, t.zone, t.spotNumber
        FROM auto_checkouts ac
        JOIN parkings p ON ac.parkingId = p.id
        JOIN tickets t ON ac.ticketId = t.id
        WHERE ac.userId = ?
        ORDER BY ac.initiatedAt DESC
        LIMIT ?
      `);
      
      stmt.bind([userId, limit]);
      
      const history = [];
      while (stmt.step()) {
        history.push(stmt.getAsObject());
      }
      
      stmt.free();
      return history;
      
    } catch (error) {
      console.error('Error getting checkout history:', error);
      return [];
    }
  }

  // Start the auto-checkout service
  start() {
    this.initializeCheckoutZones();
    
    // Set up periodic cleanup of old tracking data
    setInterval(() => {
      this.cleanupOldTrackingData();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    console.log('Auto-checkout manager started');
  }

  // Clean up old tracking data
  cleanupOldTrackingData() {
    const cutoffTime = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
    
    for (const [userId, positions] of this.vehicleTracking.entries()) {
      const filteredPositions = positions.filter(pos => pos.timestamp > cutoffTime);
      
      if (filteredPositions.length === 0) {
        this.vehicleTracking.delete(userId);
      } else if (filteredPositions.length !== positions.length) {
        this.vehicleTracking.set(userId, filteredPositions);
      }
    }
  }

  // Validate position data format
  validatePositionData(position) {
    if (!position || typeof position !== 'object') {
      throw new Error('Position data is required and must be an object');
    }
    
    if (typeof position.latitude !== 'number' || isNaN(position.latitude)) {
      throw new Error('Invalid latitude: must be a number');
    }
    
    if (typeof position.longitude !== 'number' || isNaN(position.longitude)) {
      throw new Error('Invalid longitude: must be a number');
    }
    
    if (position.latitude < -90 || position.latitude > 90) {
      throw new Error('Latitude must be between -90 and 90');
    }
    
    if (position.longitude < -180 || position.longitude > 180) {
      throw new Error('Longitude must be between -180 and 180');
    }
    
    if (position.accuracy && (typeof position.accuracy !== 'number' || position.accuracy < 0)) {
      throw new Error('Accuracy must be a non-negative number');
    }
    
    return true;
  }
}

module.exports = AutoCheckoutManager;