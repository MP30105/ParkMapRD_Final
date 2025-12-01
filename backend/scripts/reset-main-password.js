const bcrypt = require('bcryptjs');
const { getDb, saveDb } = require('../db');

(async () => {
  const db = getDb();
  const newPass = process.argv[2] || 'MAIN123!';
  const hash = await bcrypt.hash(newPass, 10);
  try {
    const stmt = db.prepare('UPDATE users SET passwordHash = ? WHERE role = ?');
    stmt.bind([hash, 'main']);
    stmt.step();
    stmt.free();
    saveDb();
    console.log('[reset-main-password] Updated main password to:', newPass);
  } catch (e) {
    console.error('[reset-main-password] Error updating main password:', e.message);
    process.exit(1);
  }
})();