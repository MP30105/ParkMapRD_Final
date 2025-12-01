const { getDb, saveDb } = require('./db');

function getDb_() {
  return getDb();
}

function getAll() {
  const db = getDb_();
  const result = db.exec('SELECT * FROM parkings');
  if (result.length === 0) return [];
  return result[0].values.map(row => ({
    id: row[0],
    name: row[1],
    lat: row[2],
    lng: row[3],
    totalSpots: row[4],
    availableSpots: row[5],
    securityVideoUrl: row[6] || '',
    hourlyRate: row[7] || 100,
    sellsTickets: row[8] !== undefined ? row[8] : 1
  }));
}

function getById(id) {
  const db = getDb_();
  const stmt = db.prepare('SELECT * FROM parkings WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function createParking({ id, name, lat = 0, lng = 0, totalSpots = 10, availableSpots, securityVideoUrl = '', hourlyRate = 100, sellsTickets = 1 }) {
  const av = availableSpots !== undefined ? availableSpots : totalSpots;
  const db = getDb_();
  const stmt = db.prepare('INSERT INTO parkings (id,name,lat,lng,totalSpots,availableSpots,securityVideoUrl,hourlyRate,sellsTickets) VALUES (?,?,?,?,?,?,?,?,?)');
  stmt.bind([id, name, lat, lng, totalSpots, av, securityVideoUrl, hourlyRate, sellsTickets ? 1 : 0]);
  stmt.step();
  stmt.free();
  saveDb();
  return getById(id);
}

function updateAvailability(id, availableSpots) {
  const p = getById(id);
  if (!p) {
    console.error(`[updateAvailability] Parking not found for id: ${id}`);
    return null;
  }
  const av = Math.max(0, Math.min(availableSpots, p.totalSpots));
  console.log(`[updateAvailability] Updating parking ${id}: availableSpots from ${p.availableSpots} to ${av} (totalSpots: ${p.totalSpots})`);
  const db = getDb_();
  const stmt = db.prepare('UPDATE parkings SET availableSpots = ? WHERE id = ?');
  stmt.bind([av, id]);
  stmt.step();
  stmt.free();
  saveDb();
  const updated = getById(id);
  console.log(`[updateAvailability] After update:`, updated);
  return updated;
}

function updateParking(id, patch) {
  const p = getById(id);
  if (!p) return null;
  const next = { ...p, ...patch };
  const db = getDb_();
  const stmt = db.prepare('UPDATE parkings SET name = ?, lat = ?, lng = ?, totalSpots = ?, availableSpots = ?, securityVideoUrl = ?, hourlyRate = ?, sellsTickets = ? WHERE id = ?');
  stmt.bind([next.name, next.lat, next.lng, next.totalSpots, next.availableSpots, next.securityVideoUrl || '', next.hourlyRate || 100, next.sellsTickets !== undefined ? (next.sellsTickets ? 1 : 0) : 1, id]);
  stmt.step();
  stmt.free();
  saveDb();
  return getById(id);
}

function deleteParking(id) {
  const p = getById(id);
  if (!p) return null;
  const db = getDb_();
  const stmt = db.prepare('DELETE FROM parkings WHERE id = ?');
  stmt.bind([id]);
  stmt.step();
  stmt.free();
  saveDb();
  return p;
}

module.exports = { getAll, getById, updateAvailability, createParking, updateParking, deleteParking };
