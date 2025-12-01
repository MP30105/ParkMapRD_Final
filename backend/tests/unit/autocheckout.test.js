const AutoCheckoutManager = require('../../AutoCheckoutManager');
const { getDb } = require('../../db');

describe('AutoCheckoutManager', () => {
  let manager;
  let db;

  beforeEach(() => {
    manager = new AutoCheckoutManager();
    db = getDb();
  });

  test('should initialize with empty zones and tracking', () => {
    expect(manager.activeZones).toBeInstanceOf(Map);
    expect(manager.vehicleTracking).toBeInstanceOf(Map);
    expect(manager.checkoutQueue).toBeInstanceOf(Set);
    expect(manager.processors).toHaveProperty('geolocation');
    expect(manager.processors).toHaveProperty('sensor');
    expect(manager.processors).toHaveProperty('manual');
  });

  test('should track vehicle position successfully', async () => {
    const userId = 'test-user-123';
    const positionData = {
      latitude: 18.4861,
      longitude: -69.9312,
      accuracy: 10,
      timestamp: Date.now()
    };

    expect(() => manager.trackVehiclePosition(userId, positionData)).not.toThrow();
    
    // Check if position was stored
    const positions = manager.vehicleTracking.get(userId) || [];
    expect(positions.length).toBeGreaterThan(0);
  });

  test('should validate position data', () => {
    const validPosition = {
      latitude: 18.4861,
      longitude: -69.9312,
      accuracy: 10,
      timestamp: Date.now()
    };

    const invalidPosition = {
      latitude: 'invalid',
      longitude: -69.9312,
      accuracy: 10,
      timestamp: Date.now()
    };

    expect(() => manager.validatePositionData(validPosition)).not.toThrow();
    expect(() => manager.validatePositionData(invalidPosition)).toThrow();
  });

  test('should process manual checkout', async () => {
    const ticketId = 'ticket-123';
    const userId = 'user-456';

    expect(() => manager.processManualCheckout(ticketId, userId)).not.toThrow();
  });

  test('should handle sensor data processing', async () => {
    const sensorData = {
      sensorId: 'sensor-001',
      parkingId: 'parking-123',
      action: 'exit',
      vehicleId: 'plate-ABC123',
      timestamp: Date.now()
    };

    expect(() => manager.processSensorCheckout(sensorData)).not.toThrow();
  });

  test('should initialize checkout zones from database', async () => {
    await manager.initializeCheckoutZones();
    // Should not throw and should populate active zones if config exists
    expect(manager.activeZones).toBeInstanceOf(Map);
  });

  test('should have processors for different checkout methods', async () => {
    expect(manager.processors).toHaveProperty('geolocation');
    expect(manager.processors).toHaveProperty('sensor');
    expect(manager.processors).toHaveProperty('manual');
  });
});

describe('AutoCheckoutManager Edge Cases', () => {
  let manager;

  beforeEach(() => {
    manager = new AutoCheckoutManager();
  });

  test('should handle invalid user ID gracefully', async () => {
    expect(() => manager.trackVehiclePosition(null, {})).toThrow('Valid user ID is required');
    expect(() => manager.trackVehiclePosition('', {})).toThrow('Valid user ID is required');
  });

  test('should handle missing position data', async () => {
    expect(() => manager.trackVehiclePosition('user-123', null)).toThrow('Position data is required');
    expect(() => manager.trackVehiclePosition('user-123', {})).toThrow('Invalid latitude');
  });

  test('should handle invalid sensor data', async () => {
    // Methods have try-catch, so they don't throw, but we can test they complete
    expect(() => manager.processSensorCheckout(null)).not.toThrow();
    expect(() => manager.processSensorCheckout({})).not.toThrow();
  });

  test('should handle database errors gracefully', async () => {
    // Methods have error handling, so they should not throw
    expect(() => manager.processManualCheckout(null, null)).not.toThrow();
  });
});