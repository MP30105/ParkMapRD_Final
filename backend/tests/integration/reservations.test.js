const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createUser } = require('../../parkmaprdUserStore');
const parkingStore = require('../../parkmaprdData');

// We require the running server instance. server.js starts immediately.
let serverInstance;

beforeAll(() => {
  serverInstance = require('../../server'); // Ensure server is loaded
});

describe('Reservation Flow (Integration)', () => {
  let token;
  let parkingId;
  const username = 'itestuser';
  const passwordPlain = 'itestpass123';

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(passwordPlain, 10);
    createUser({ email: 'itest@local', username, passwordHash, name: 'ITest' });
    const allParkings = parkingStore.getAll();
    parkingId = allParkings[0]?.id;
    expect(parkingId).toBeDefined();
  });

  test('login to obtain JWT', async () => {
    const res = await request(serverInstance)
      .post('/api/parkmaprd/auth/login')
      .send({ username, password: passwordPlain });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    token = res.body.token;
  });

  test('create reservation with valid future time', async () => {
    const startTime = Date.now() + 30 * 60 * 1000; // 30 min ahead
    const res = await request(serverInstance)
      .post('/api/parkmaprd/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ parkingId, startTime, duration: 60 });
    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(/^res/);
    expect(res.body.status).toBe('confirmed');
  });

  test('reject reservation in the past', async () => {
    const startTime = Date.now() - 10 * 60 * 1000; // 10 min ago
    const res = await request(serverInstance)
      .post('/api/parkmaprd/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ parkingId, startTime, duration: 60 });
    expect(res.status).toBe(400);
  });

  test('reject reservation beyond advance limit (default 30d)', async () => {
    // 31 days in ms
    const startTime = Date.now() + 31 * 24 * 60 * 60 * 1000;
    const res = await request(serverInstance)
      .post('/api/parkmaprd/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ parkingId, startTime, duration: 60 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/max 30d advance/i);
  });
});
