(async () => {
  const base = 'http://localhost:4000';
  try {
    console.log('1) Registering user...');
    const email = `testuser+${Date.now()}@example.com`;
    const password = 'pass1234';
  const registerRes = await fetch(base + '/api/parkmaprd/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'Demo User', licensePlate: 'GHI-789' })
    });
    const registerData = await registerRes.json();
    console.log('register:', registerRes.status, registerData);

    console.log('\n2) Logging in...');
  const loginRes = await fetch(base + '/api/parkmaprd/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const loginData = await loginRes.json();
    console.log('login:', loginRes.status, loginData);
    const token = loginData.token;

    console.log('\n3) List parkings');
  const parkingsRes = await fetch(base + '/api/parkmaprd/parkings');
    const parkings = await parkingsRes.json();
    console.log('parkings:', parkings);

    console.log('\n4) Simulate camera update for p2 (set availableSpots=5)');
    const cameraToken = process.env.CAMERA_TOKEN || 'CAMERA_SECRET_123';
  const camRes = await fetch(base + '/api/parkmaprd/parkings/p2/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cameraToken}` },
      body: JSON.stringify({ availableSpots: 5 })
    });
    const camData = await camRes.json();
    console.log('camera update:', camRes.status, camData);

    console.log('\n5) Get updated p2');
  const p2res = await fetch(base + '/api/parkmaprd/parkings/p2');
    const p2 = await p2res.json();
    console.log('p2:', p2);

    console.log('\n6) Checkout (mock payment) as user');
  const payRes = await fetch(base + '/api/parkmaprd/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ parkingId: 'p2', amount: 5.0 })
    });
    const payData = await payRes.json();
    console.log('payment:', payRes.status, payData);

    console.log('\nDemo complete');
  } catch (err) {
    console.error('Demo error', err);
    process.exit(1);
  }
})();
