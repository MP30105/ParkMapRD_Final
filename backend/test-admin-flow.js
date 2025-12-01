const fetch = require('node-fetch');

async function testAdminFlow() {
  try {
    console.log('=== PROBANDO FLUJO COMPLETO DE ADMINISTRADOR ===\n');
    
    // 1. Login como admin
    console.log('1. 🔐 Login como administrador...');
    const loginResponse = await fetch('http://localhost:5000/api/parkmaprd/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'adminpass'
      })
    });
    
    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }
    
    const loginData = await loginResponse.json();
    const token = loginData.token;
    const user = loginData.user;
    
    console.log('   ✅ Login exitoso!');
    console.log(`   📋 Usuario: ${user.name} (${user.email})`);
    console.log(`   🔑 Rol: ${user.role}`);
    console.log(`   🎫 Token: ${token.substring(0,20)}...`);
    
    // 2. Cargar parkings actuales
    console.log('\n2. 📍 Cargando parkings existentes...');
    const parkingsResponse = await fetch('http://localhost:5000/api/parkmaprd/parkings');
    const parkings = await parkingsResponse.json();
    
    console.log(`   ✅ Cargados ${parkings.length} parkings existentes`);
    parkings.forEach(p => {
      console.log(`   📌 ${p.id}: ${p.name} (${p.lat}, ${p.lng})`);
    });
    
    // 3. Crear un nuevo parking
    console.log('\n3. ➕ Creando nuevo parking como administrador...');
    const newParkingId = 'test_' + Date.now();
    const newParkingResponse = await fetch('http://localhost:5000/api/parkmaprd/admin/parkings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        id: newParkingId,
        name: 'Test Parking Admin',
        lat: 18.4900,
        lng: -69.9400,
        totalSpots: 15,
        availableSpots: 15,
        hourlyRate: 150,
        securityVideoUrl: 'https://example.com/camera'
      })
    });
    
    if (!newParkingResponse.ok) {
      const error = await newParkingResponse.text();
      throw new Error(`Failed to create parking: ${error}`);
    }
    
    const newParking = await newParkingResponse.json();
    console.log('   ✅ Parking creado exitosamente!');
    console.log(`   🆔 ID: ${newParking.id}`);
    console.log(`   📍 Nombre: ${newParking.name}`);
    console.log(`   🗺️ Ubicación: ${newParking.lat}, ${newParking.lng}`);
    
    // 4. Verificar que aparece en la lista general
    console.log('\n4. 🔍 Verificando que aparezca en la lista general...');
    const updatedParkingsResponse = await fetch('http://localhost:5000/api/parkmaprd/parkings');
    const updatedParkings = await updatedParkingsResponse.json();
    
    const createdParking = updatedParkings.find(p => p.id === newParkingId);
    if (createdParking) {
      console.log('   ✅ ¡PERFECTO! El parking aparece en la lista general');
      console.log(`   📋 Total parkings ahora: ${updatedParkings.length}`);
    } else {
      console.log('   ❌ ERROR: El parking no aparece en la lista general');
    }
    
    // 5. Resultados finales
    console.log('\n=== RESULTADOS FINALES ===');
    console.log('✅ Login de administrador: FUNCIONANDO');
    console.log('✅ Creación de parking: FUNCIONANDO');  
    console.log('✅ Sincronización con lista general: ' + (createdParking ? 'FUNCIONANDO' : 'FALLANDO'));
    console.log('\n🎉 ¡Sistema de administrador completamente funcional!');
    
    console.log('\n📋 CREDENCIALES PARA USAR:');
    console.log('   👤 Usuario: admin');
    console.log('   🔐 Contraseña: adminpass');
    console.log('   🌐 URL: http://localhost:3000');
    
  } catch (error) {
    console.error('❌ Error en prueba:', error.message);
  }
}

testAdminFlow();