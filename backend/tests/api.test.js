const request = require('supertest');
const { server, closeServer } = require('../server');

describe('API basic tests', () => {
  afterAll(async () => {
    await closeServer();
  });

  test('GET /api/parkmaprd/parkings returns array', async () => {
    const res = await request('http://localhost:4000').get('/api/parkmaprd/parkings');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('Register and login flow', async () => {
    const email = `t_${Date.now()}@example.com`;
    const password = 'pwd12345';
    const reg = await request('http://localhost:4000')
      .post('/api/parkmaprd/auth/register')
      .send({ email, password, name: 'T', licensePlate: 'X' });
    expect(reg.status).toBe(200);
    expect(reg.body.token).toBeTruthy();

  const login = await request('http://localhost:4000').post('/api/parkmaprd/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });
});
