// Jest setup file for backend tests
const { init: initDb } = require('../db');

beforeAll(async () => {
  // Initialize test database
  await initDb();
});

afterAll(async () => {
  // Cleanup after tests
});

// Global test utilities
global.testUtils = {
  generateTestEmail: () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}@example.com`,
  generateTestUser: () => ({
    email: global.testUtils.generateTestEmail(),
    password: 'testPass123',
    name: 'Test User',
    licensePlate: 'TEST123'
  }),
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};