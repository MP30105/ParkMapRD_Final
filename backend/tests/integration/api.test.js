const request = require('supertest');

let app;
let token;
let userId;

// Import server after environment is set
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  app = require('../../server').app;
  
  // Create a test user and get token
  const testUser = global.testUtils.generateTestUser();
  const registerRes = await request(app)
    .post('/api/parkmaprd/auth/register')
    .send(testUser);
  
  expect(registerRes.status).toBe(200);
  token = registerRes.body.token;
  userId = registerRes.body.user.id;
});

describe('Parking API Integration', () => {
  test('GET /api/parkmaprd/parkings should return parkings list', async () => {
    const res = await request(app)
      .get('/api/parkmaprd/parkings')
      .expect(200);
    
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    
    // Check parking structure
    const parking = res.body[0];
    expect(parking).toHaveProperty('id');
    expect(parking).toHaveProperty('name');
    expect(parking).toHaveProperty('lat');
    expect(parking).toHaveProperty('lon');
  });

  test('GET /api/parkmaprd/parkings/:id should return specific parking', async () => {
    // First get all parkings to get a valid ID
    const parkingsRes = await request(app)
      .get('/api/parkmaprd/parkings')
      .expect(200);
    
    const parkingId = parkingsRes.body[0].id;
    
    const res = await request(app)
      .get(`/api/parkmaprd/parkings/${parkingId}`)
      .expect(200);
    
    expect(res.body).toHaveProperty('id', parkingId);
    expect(res.body).toHaveProperty('name');
  });

  test('POST /api/parkmaprd/reserve should create reservation with valid token', async () => {
    const parkingsRes = await request(app).get('/api/parkmaprd/parkings');
    const parkingId = parkingsRes.body[0].id;
    
    const reservationData = {
      parkingId,
      startTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      endTime: new Date(Date.now() + 7200000).toISOString(),   // 2 hours from now
      licensePlate: 'TEST123'
    };
    
    const res = await request(app)
      .post('/api/parkmaprd/reserve')
      .set('Authorization', `Bearer ${token}`)
      .send(reservationData)
      .expect(200);
    
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('qrCode');
    expect(res.body.parkingId).toBe(parkingId);
  });
});

describe('User Authentication Integration', () => {
  test('POST /api/parkmaprd/auth/register should create new user', async () => {
    const testUser = global.testUtils.generateTestUser();
    
    const res = await request(app)
      .post('/api/parkmaprd/auth/register')
      .send(testUser)
      .expect(200);
    
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe(testUser.email);
  });

  test('POST /api/parkmaprd/auth/login should authenticate user', async () => {
    const testUser = global.testUtils.generateTestUser();
    
    // First register
    await request(app)
      .post('/api/parkmaprd/auth/register')
      .send(testUser);
    
    // Then login
    const res = await request(app)
      .post('/api/parkmaprd/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      })
      .expect(200);
    
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
  });

  test('GET /api/parkmaprd/users/me should return user info with valid token', async () => {
    const res = await request(app)
      .get('/api/parkmaprd/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    
    expect(res.body).toHaveProperty('id', userId);
    expect(res.body).toHaveProperty('email');
    expect(res.body).toHaveProperty('name');
  });

  test('should reject requests with invalid token', async () => {
    await request(app)
      .get('/api/parkmaprd/users/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });
});

describe('Auto-Checkout API Integration', () => {
  test('POST /api/parkmaprd/auto-checkout/position should track position', async () => {
    const positionData = {
      latitude: 18.4861,
      longitude: -69.9312,
      accuracy: 10
    };
    
    const res = await request(app)
      .post('/api/parkmaprd/auto-checkout/position')
      .set('Authorization', `Bearer ${token}`)
      .send(positionData)
      .expect(200);
    
    expect(res.body).toHaveProperty('message', 'Position tracked successfully');
  });

  test('POST /api/parkmaprd/auto-checkout/sensor should process sensor data', async () => {
    const sensorData = {
      sensorId: 'sensor-001',
      parkingId: 'parking-test',
      eventType: 'vehicle_exit',
      vehicleId: 'TEST123',
      confidence: 0.95
    };
    
    const res = await request(app)
      .post('/api/parkmaprd/auto-checkout/sensor')
      .send(sensorData)
      .expect(200);
    
    expect(res.body).toHaveProperty('message');
  });

  test('GET /api/parkmaprd/auto-checkout/history should return checkout history', async () => {
    const res = await request(app)
      .get('/api/parkmaprd/auto-checkout/history')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Search and Comparison Integration', () => {
  test('POST /api/parkmaprd/search should return filtered results', async () => {
    const searchData = {
      lat: 18.4861,
      lon: -69.9312,
      radius: 5000,
      amenities: ['security', 'covered']
    };
    
    const res = await request(app)
      .post('/api/parkmaprd/search')
      .send(searchData)
      .expect(200);
    
    expect(res.body).toHaveProperty('results');
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  test('GET /api/parkmaprd/comparison/lists should return user comparison lists', async () => {
    const res = await request(app)
      .get('/api/parkmaprd/comparison/lists')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    
    expect(Array.isArray(res.body)).toBe(true);
  });
});