const dbModule = require('./db');
const bcrypt = require('bcryptjs');
const {
  createUser,
  findUserByEmail,
  findUserByUsername,
} = require('./parkmaprdUserStore');

async function testAuth() {
  // Inicializar la base de datos primero
  console.log('🔄 Inicializando base de datos...');
  await dbModule.init();
  console.log('✅ Base de datos inicializada');
  console.log('');
  try {
    console.log('=== CREANDO USUARIO DE PRUEBA ===');
    
    // Hashear la contraseña
    const password = '123456';
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Crear usuario de prueba
    const newUser = await createUser({
      email: 'usuario@test.com',
      username: 'usuario',
      passwordHash: passwordHash,
      name: 'Usuario Test',
      licensePlate: 'TEST123'
    });
    
    console.log('✅ Usuario creado exitosamente:', { 
      id: newUser.id, 
      email: newUser.email, 
      username: newUser.username,
      name: newUser.name 
    });
    
    console.log('\n=== PROBANDO BUSQUEDA POR USERNAME ===');
    const userByUsername = await findUserByUsername('usuario');
    console.log('Encontrado por username:', userByUsername ? 'SÍ' : 'NO');
    if (userByUsername) {
      console.log('Datos:', { 
        id: userByUsername.id, 
        email: userByUsername.email, 
        username: userByUsername.username 
      });
    }
    
    console.log('\n=== PROBANDO BUSQUEDA POR EMAIL ===');
    const userByEmail = await findUserByEmail('usuario@test.com');
    console.log('Encontrado por email:', userByEmail ? 'SÍ' : 'NO');
    if (userByEmail) {
      console.log('Datos:', { 
        id: userByEmail.id, 
        email: userByEmail.email, 
        username: userByEmail.username 
      });
    }
    
    console.log('\n=== CREDENCIALES PARA USAR ===');
    console.log('Username: usuario');
    console.log('Email: usuario@test.com');  
    console.log('Password: 123456');
    console.log('\n✅ Puedes usar cualquiera de estos para hacer login');
    
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      console.log('⚠️ El usuario ya existe, mostrando datos existentes...');
      
      const existingUser = await findUserByUsername('usuario') || await findUserByEmail('usuario@test.com');
      if (existingUser) {
        console.log('✅ Usuario existente encontrado:', { 
          id: existingUser.id, 
          email: existingUser.email, 
          username: existingUser.username,
          name: existingUser.name 
        });
        
        console.log('\n=== CREDENCIALES PARA USAR ===');
        console.log('Username: usuario');
        console.log('Email: usuario@test.com');  
        console.log('Password: 123456');
        console.log('\n✅ Puedes usar cualquiera de estos para hacer login');
      }
    } else {
      console.error('❌ Error:', error);
    }
  }
}

testAuth();