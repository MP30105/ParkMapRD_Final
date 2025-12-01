// Script para crear usuarios managers manualmente
const bcrypt = require('bcryptjs');
const dbModule = require('../db');
const { v4: uuidv4 } = require('uuid');

async function createManagers() {
  console.log('🔧 Inicializando base de datos...');
  await dbModule.init();
  
  console.log('🔧 Creando usuarios managers...');
  
  const db = dbModule.getDb();
  const password = 'manager123';
  const passwordHash = await bcrypt.hash(password, 10);
  
  // Obtener los primeros 3 parkings
  const parkingsStmt = db.prepare('SELECT id, name FROM parkings LIMIT 3');
  const parkings = [];
  while (parkingsStmt.step()) {
    parkings.push(parkingsStmt.getAsObject());
  }
  parkingsStmt.free();
  
  console.log(`📍 Encontrados ${parkings.length} parkings`);
  
  for (const parking of parkings) {
    const username = `manager_${parking.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
    const email = `${username}@parkmaprd.local`;
    const userId = uuidv4();
    
    // Verificar si ya existe
    const checkStmt = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?');
    checkStmt.bind([username, email]);
    const exists = checkStmt.step();
    checkStmt.free();
    
    if (exists) {
      console.log(`⚠️  Usuario ${username} ya existe, actualizando contraseña...`);
      const updateStmt = db.prepare('UPDATE users SET passwordHash = ?, role = ? WHERE username = ? OR email = ?');
      updateStmt.bind([passwordHash, 'parking_manager', username, email]);
      updateStmt.step();
      updateStmt.free();
      
      // Obtener el userId existente
      const getUserStmt = db.prepare('SELECT id FROM users WHERE username = ?');
      getUserStmt.bind([username]);
      let existingUserId;
      if (getUserStmt.step()) {
        existingUserId = getUserStmt.getAsObject().id;
      }
      getUserStmt.free();
      
      // Verificar si ya está asignado
      const checkAssignStmt = db.prepare('SELECT id FROM parking_managers WHERE userId = ? AND parkingId = ?');
      checkAssignStmt.bind([existingUserId, parking.id]);
      const assignExists = checkAssignStmt.step();
      checkAssignStmt.free();
      
      if (!assignExists) {
        const assignmentId = uuidv4();
        const assignStmt = db.prepare(`
          INSERT INTO parking_managers (id, userId, parkingId, assignedBy, assignedAt, active)
          VALUES (?, ?, ?, ?, ?, 1)
        `);
        assignStmt.bind([assignmentId, existingUserId, parking.id, 'system', Math.floor(Date.now() / 1000)]);
        assignStmt.step();
        assignStmt.free();
        console.log(`✅ Asignado ${username} a ${parking.name}`);
      }
    } else {
      console.log(`➕ Creando nuevo usuario: ${username}`);
      
      // Crear usuario
      const insertStmt = db.prepare(`
        INSERT INTO users (id, email, username, passwordHash, name, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertStmt.bind([userId, email, username, passwordHash, `Manager ${parking.name}`, 'parking_manager']);
      insertStmt.step();
      insertStmt.free();
      
      // Asignar al parking
      const assignmentId = uuidv4();
      const assignStmt = db.prepare(`
        INSERT INTO parking_managers (id, userId, parkingId, assignedBy, assignedAt, active)
        VALUES (?, ?, ?, ?, ?, 1)
      `);
      assignStmt.bind([assignmentId, userId, parking.id, 'system', Math.floor(Date.now() / 1000)]);
      assignStmt.step();
      assignStmt.free();
      
      console.log(`✅ Creado ${username} / ${password} -> ${parking.name}`);
    }
  }
  
  dbModule.saveDb();
  console.log('\n🎉 ¡Managers creados exitosamente!');
  console.log('📝 Credenciales: username / manager123');
  console.log('\nUsuarios disponibles:');
  
  // Listar todos los managers
  const listStmt = db.prepare(`
    SELECT u.username, u.email, u.role, p.name as parking_name
    FROM users u
    LEFT JOIN parking_managers pm ON u.id = pm.userId
    LEFT JOIN parkings p ON pm.parkingId = p.id
    WHERE u.role = 'parking_manager'
  `);
  
  while (listStmt.step()) {
    const row = listStmt.getAsObject();
    console.log(`  - ${row.username} -> ${row.parking_name || 'Sin asignar'}`);
  }
  listStmt.free();
}

createManagers()
  .then(() => {
    console.log('\n✅ Script completado');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
