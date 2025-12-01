const bcrypt = require('bcryptjs');
const { createUser, findUserByUsername, findUserByEmail, findUserById, addTicket } = require('../../parkmaprdUserStore');
const { getDb } = require('../../db');

describe('Auth/User Store Unit', () => {
  let passwordPlain;
  let passwordHash;
  let user;

  beforeAll(async () => {
    passwordPlain = 'Secret123';
    passwordHash = await bcrypt.hash(passwordPlain, 10);
    user = createUser({ email: 'unit@test.local', username: 'unittest', passwordHash, name: 'Unit Tester', licensePlate: 'UNIT-123' });
  });

  test('created user should be retrievable by username', () => {
    const byUser = findUserByUsername('unittest');
    expect(byUser).toBeDefined();
    expect(byUser.email).toBe('unit@test.local');
    expect(byUser.cars.length).toBeGreaterThanOrEqual(1); // licensePlate inserted as car
  });

  test('created user should be retrievable by email', () => {
    const byEmail = findUserByEmail('unit@test.local');
    expect(byEmail).toBeDefined();
    expect(byEmail.username).toBe('unittest');
  });

  test('created user should be retrievable by id', () => {
    const byId = findUserById(user.id);
    expect(byId).toBeDefined();
    expect(byId.username).toBe('unittest');
  });

  test('password hash should validate with bcrypt.compare', async () => {
    const ok = await bcrypt.compare(passwordPlain, user.passwordHash);
    expect(ok).toBe(true);
  });

  test('should allow adding a ticket and retrieving it under user', () => {
    const ticket = {
      id: 't' + Date.now(),
      parkingId: 'P1',
      userId: user.id,
      carId: null,
      zone: null,
      spotNumber: 5,
      startTime: Date.now(),
      endTime: Date.now() + 3600000,
      status: 'active'
    };
    addTicket(user.id, ticket);
    const updated = findUserById(user.id);
    expect(updated.tickets.some(t => t.id === ticket.id)).toBe(true);
  });
});
