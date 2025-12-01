const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function fixUserRole() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, 'data', 'parkmaprd.sqlite');
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  
  // Update user 1234 to parking_assistant
  db.run("UPDATE users SET role = 'parking_assistant' WHERE username = '1234'");
  
  // Save the database
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  
  // Verify
  const result = db.exec("SELECT username, role FROM users WHERE username = '1234'");
  console.log('Usuario 1234 actualizado:', JSON.stringify(result[0]?.values));
  
  // Show all assistants
  const assistants = db.exec("SELECT username, role FROM users WHERE role = 'parking_assistant'");
  console.log('Todos los asistentes:', JSON.stringify(assistants[0]?.values));
  
  db.close();
}

fixUserRole().catch(console.error);
