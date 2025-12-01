const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'parkings.json');

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) {
    const initial = [
      { id: 'p1', name: 'Main Street Parking', lat: 18.4861, lng: -69.9312, totalSpots: 20, availableSpots: 12 },
      { id: 'p2', name: 'Downtown Garage', lat: 18.4723, lng: -69.9399, totalSpots: 50, availableSpots: 0 }
    ];
    fs.writeFileSync(FILE, JSON.stringify(initial, null, 2));
  }
}

function read() {
  ensureData();
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function write(data) {
  ensureData();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function getAll() { return read(); }
function getById(id) { return read().find((p) => p.id === id); }
function updateAvailability(id, availableSpots) {
  const data = read();
  const idx = data.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  data[idx].availableSpots = availableSpots;
  write(data);
  return data[idx];
}

module.exports = { getAll, getById, updateAvailability };
