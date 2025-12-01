const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'users.json');

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify([]));
}

function read() {
  ensureData();
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function write(data) {
  ensureData();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function createUser({ email, passwordHash, name, licensePlate }) {
  const users = read();
  const id = 'u' + (users.length + 1);
  const user = { id, email, passwordHash, name, licensePlate };
  users.push(user);
  write(users);
  return user;
}

function findUserByEmail(email) {
  return read().find((u) => u.email === email);
}

module.exports = { createUser, findUserByEmail };
