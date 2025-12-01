const { getDb } = require('../../db');
const { validateEmail, validatePassword, validateLicensePlate } = require('../../utils');

describe('Database Operations', () => {
  let db;

  beforeAll(() => {
    db = getDb();
  });

  test('should initialize database successfully', () => {
    expect(db).toBeDefined();
    expect(typeof db.exec).toBe('function');
  });

  test('should have parkings table with data', () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM parkings');
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();
    expect(result.count).toBeGreaterThan(0);
  });

  test('should have users table', () => {
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    expect(result).toBeDefined();
    expect(result.name).toBe('users');
  });

  test('should have all required auto-checkout tables', () => {
    const requiredTables = [
      'auto_checkout_config',
      'auto_checkouts', 
      'vehicle_positions',
      'sensor_events',
      'notifications',
      'notification_templates'
    ];

    requiredTables.forEach(tableName => {
      const stmt = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
      let result = null;
      if (stmt.step()) {
        result = stmt.getAsObject();
      }
      stmt.free();
      expect(result).toBeDefined();
      expect(result.name).toBe(tableName);
    });
  });
});

describe('Utility Functions', () => {
  describe('validateEmail', () => {
    test('should accept valid email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name+tag@example.co.uk')).toBe(true);
      expect(validateEmail('simple@test.org')).toBe(true);
    });

    test('should reject invalid email addresses', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
      expect(validateEmail(null)).toBe(false);
    });
  });

  describe('validatePassword', () => {
    test('should accept valid passwords', () => {
      expect(validatePassword('password123')).toBe(true);
      expect(validatePassword('MyStrongPass!')).toBe(true);
      expect(validatePassword('12345678')).toBe(true);
    });

    test('should reject invalid passwords', () => {
      expect(validatePassword('123')).toBe(false); // too short
      expect(validatePassword('')).toBe(false);
      expect(validatePassword(null)).toBe(false);
    });
  });

  describe('validateLicensePlate', () => {
    test('should accept valid license plates', () => {
      expect(validateLicensePlate('ABC123')).toBe(true);
      expect(validateLicensePlate('A123456')).toBe(true);
      expect(validateLicensePlate('XYZ-789')).toBe(true);
    });

    test('should reject invalid license plates', () => {
      expect(validateLicensePlate('')).toBe(false);
      expect(validateLicensePlate('A')).toBe(false); // too short
      expect(validateLicensePlate(null)).toBe(false);
    });
  });
});