const request = require('supertest');
const { performance } = require('perf_hooks');

let app;
const testUsers = [];
const testTokens = [];

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  app = require('../../server').app;
  
  // Create multiple test users for load testing
  for (let i = 0; i < 10; i++) {
    const testUser = global.testUtils.generateTestUser();
    const registerRes = await request(app)
      .post('/api/parkmaprd/auth/register')
      .send(testUser);
    
    testUsers.push(testUser);
    testTokens.push(registerRes.body.token);
  }
});

describe('Performance Tests', () => {
  test('GET /api/parkmaprd/parkings should respond within 500ms', async () => {
    const start = performance.now();
    
    const res = await request(app)
      .get('/api/parkmaprd/parkings')
      .expect(200);
    
    const end = performance.now();
    const responseTime = end - start;
    
    expect(responseTime).toBeLessThan(500);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('Authentication should be fast', async () => {
    const testUser = testUsers[0];
    const start = performance.now();
    
    await request(app)
      .post('/api/parkmaprd/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      })
      .expect(200);
    
    const end = performance.now();
    const responseTime = end - start;
    
    expect(responseTime).toBeLessThan(200);
  });

  test('Search endpoint should handle complex queries efficiently', async () => {
    const searchData = {
      lat: 18.4861,
      lon: -69.9312,
      radius: 5000,
      amenities: ['security', 'covered', 'electric_charging'],
      minPrice: 10,
      maxPrice: 100,
      availableOnly: true
    };
    
    const start = performance.now();
    
    await request(app)
      .post('/api/parkmaprd/search')
      .send(searchData)
      .expect(200);
    
    const end = performance.now();
    const responseTime = end - start;
    
    expect(responseTime).toBeLessThan(1000);
  });
});

describe('Load Tests', () => {
  test('should handle concurrent parking list requests', async () => {
    const concurrentRequests = 20;
    const requests = [];
    
    const start = performance.now();
    
    for (let i = 0; i < concurrentRequests; i++) {
      requests.push(
        request(app)
          .get('/api/parkmaprd/parkings')
          .expect(200)
      );
    }
    
    const results = await Promise.all(requests);
    const end = performance.now();
    
    const totalTime = end - start;
    const avgResponseTime = totalTime / concurrentRequests;
    
    expect(results.length).toBe(concurrentRequests);
    expect(avgResponseTime).toBeLessThan(1000);
    
    // All should return the same data structure
    results.forEach(res => {
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  test('should handle concurrent authentication requests', async () => {
    const concurrentLogins = 10;
    const requests = [];
    
    for (let i = 0; i < concurrentLogins; i++) {
      const testUser = testUsers[i];
      requests.push(
        request(app)
          .post('/api/parkmaprd/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password
          })
          .expect(200)
      );
    }
    
    const results = await Promise.all(requests);
    
    expect(results.length).toBe(concurrentLogins);
    
    // All should return valid tokens
    results.forEach(res => {
      expect(res.body.token).toBeTruthy();
      expect(res.body.user).toBeTruthy();
    });
  });

  test('should handle concurrent position tracking', async () => {
    const concurrentTracking = 5;
    const requests = [];
    
    for (let i = 0; i < concurrentTracking; i++) {
      const positionData = {
        latitude: 18.4861 + (Math.random() - 0.5) * 0.01,
        longitude: -69.9312 + (Math.random() - 0.5) * 0.01,
        accuracy: Math.floor(Math.random() * 20) + 5
      };
      
      requests.push(
        request(app)
          .post('/api/parkmaprd/auto-checkout/position')
          .set('Authorization', `Bearer ${testTokens[i]}`)
          .send(positionData)
          .expect(200)
      );
    }
    
    const results = await Promise.all(requests);
    
    expect(results.length).toBe(concurrentTracking);
    
    results.forEach(res => {
      expect(res.body.message).toBe('Position tracked successfully');
    });
  });
});

describe('Memory and Resource Tests', () => {
  test('should not have memory leaks with repeated requests', async () => {
    const initialMemory = process.memoryUsage();
    
    // Perform many requests
    for (let i = 0; i < 100; i++) {
      await request(app)
        .get('/api/parkmaprd/parkings')
        .expect(200);
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage();
    
    // Memory should not increase significantly
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;
    
    expect(memoryIncreasePercent).toBeLessThan(50); // Less than 50% increase
  });

  test('should handle large search results efficiently', async () => {
    const searchData = {
      lat: 18.4861,
      lon: -69.9312,
      radius: 50000, // Very large radius
      amenities: [], // No filters to get maximum results
    };
    
    const start = performance.now();
    const initialMemory = process.memoryUsage();
    
    const res = await request(app)
      .post('/api/parkmaprd/search')
      .send(searchData)
      .expect(200);
    
    const end = performance.now();
    const finalMemory = process.memoryUsage();
    
    const responseTime = end - start;
    const memoryUsed = finalMemory.heapUsed - initialMemory.heapUsed;
    
    expect(responseTime).toBeLessThan(2000); // Should complete within 2 seconds
    expect(memoryUsed).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
    expect(res.body.results).toBeDefined();
  });
});

describe('Database Performance Tests', () => {
  test('should handle rapid user registrations', async () => {
    const rapidRegistrations = 10;
    const requests = [];
    
    const start = performance.now();
    
    for (let i = 0; i < rapidRegistrations; i++) {
      const testUser = global.testUtils.generateTestUser();
      requests.push(
        request(app)
          .post('/api/parkmaprd/auth/register')
          .send(testUser)
      );
    }
    
    const results = await Promise.allSettled(requests);
    const end = performance.now();
    
    const totalTime = end - start;
    const avgTime = totalTime / rapidRegistrations;
    
    expect(avgTime).toBeLessThan(500); // Average less than 500ms per registration
    
    // Most should succeed (some might fail due to email conflicts, which is expected)
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
    expect(successful.length).toBeGreaterThan(rapidRegistrations * 0.8); // At least 80% success
  });

  test('should handle concurrent reservations', async () => {
    // Get available parking
    const parkingsRes = await request(app).get('/api/parkmaprd/parkings');
    const parkingId = parkingsRes.body[0].id;
    
    const concurrentReservations = 5;
    const requests = [];
    
    for (let i = 0; i < concurrentReservations; i++) {
      const reservationData = {
        parkingId,
        startTime: new Date(Date.now() + (i + 1) * 3600000).toISOString(),
        endTime: new Date(Date.now() + (i + 1) * 3600000 + 1800000).toISOString(),
        licensePlate: `TEST${i}${Date.now()}`
      };
      
      requests.push(
        request(app)
          .post('/api/parkmaprd/reserve')
          .set('Authorization', `Bearer ${testTokens[i]}`)
          .send(reservationData)
      );
    }
    
    const results = await Promise.allSettled(requests);
    
    // All should complete without database errors
    const successful = results.filter(r => r.status === 'fulfilled');
    expect(successful.length).toBe(concurrentReservations);
  });
});