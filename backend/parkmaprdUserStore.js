const { getDatabase, saveDb } = require('./db');

function getDb_() {
  return getDatabase();
}

function genId(prefix = 'u') {
	return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

function createUser({ email, username, passwordHash, name = '', licensePlate, role = 'user' }) {
	const id = genId('u');
	const db = getDb_();
	const stmt = db.prepare('INSERT INTO users (id,email,username,passwordHash,name,role) VALUES (?,?,?,?,?,?)');
	stmt.run(id, email, username || '', passwordHash, name, role);
	
	if (licensePlate) {
		const cid = genId('c');
		const cstmt = db.prepare('INSERT INTO cars (id,userId,brand,model,plate) VALUES (?,?,?,?,?)');
		cstmt.run(cid, id, '', '', licensePlate);
	}
	saveDb();
	return findUserById(id);
}

function findUserByEmail(email) {
	const db = getDb_();
	const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
	const u = stmt.get(email);
	
	if (!u) return undefined;
	
	const carStmt = db.prepare('SELECT id,brand,model,plate FROM cars WHERE userId = ?');
	const cars = carStmt.all(u.id);
	
	const tickStmt = db.prepare('SELECT * FROM tickets WHERE userId = ?');
	const tickets = tickStmt.all(u.id);
	
	return { ...u, cars, tickets };
}

function findUserByUsername(username) {
	const db = getDb_();
	const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
	const u = stmt.get(username);
	
	if (!u) return undefined;
	
	const carStmt = db.prepare('SELECT id,brand,model,plate FROM cars WHERE userId = ?');
	const cars = carStmt.all(u.id);
	
	const tickStmt = db.prepare('SELECT * FROM tickets WHERE userId = ?');
	const tickets = tickStmt.all(u.id);
	
	return { ...u, cars, tickets };
}

function findUserById(id) {
	const db = getDb_();
	const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
	const u = stmt.get(id);
	
	if (!u) return undefined;
	
	const carStmt = db.prepare('SELECT id,brand,model,plate FROM cars WHERE userId = ?');
	const cars = carStmt.all(id);
	
	const tickStmt = db.prepare('SELECT * FROM tickets WHERE userId = ?');
	const tickets = tickStmt.all(id);
	
	return { ...u, cars, tickets };
}

function updateUser(id, patch) {
	const u = findUserById(id);
	if (!u) return null;
	const next = { ...u, ...patch };
	const db = getDb_();
	const stmt = db.prepare('UPDATE users SET email = ?, username = ?, name = ?, role = ? WHERE id = ?');
	stmt.run(next.email, next.username || u.username || '', next.name, next.role || u.role, id);
	saveDb();
	return findUserById(id);
}

function listUsers() {
	const db = getDb_();
	const stmt = db.prepare('SELECT * FROM users');
	const rows = stmt.all();
	
	return rows.map(r => {
		const carStmt = db.prepare('SELECT id,brand,model,plate FROM cars WHERE userId = ?');
		const cars = carStmt.all(r.id);
		return { ...r, cars };
	});
}

function addCar(userId, { brand = '', model = '', plate }) {
	const uid = userId;
	const cid = genId('c');
	const db = getDb_();
	const stmt = db.prepare('INSERT INTO cars (id,userId,brand,model,plate) VALUES (?,?,?,?,?)');
	stmt.run(cid, uid, brand, model, plate);
	
	const getStmt = db.prepare('SELECT id,brand,model,plate FROM cars WHERE id = ?');
	const car = getStmt.get(cid);
	saveDb();
	return car;
}

function addTicket(userId, ticket) {
	const db = getDb_();
	const stmt = db.prepare('INSERT INTO tickets (id,parkingId,userId,carId,zone,spotNumber,startTime,endTime,status) VALUES (?,?,?,?,?,?,?,?,?)');
	stmt.run(ticket.id, ticket.parkingId, ticket.userId, ticket.carId, ticket.zone, ticket.spotNumber, ticket.startTime, ticket.endTime, ticket.status);
	
	const getStmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
	const t = getStmt.get(ticket.id);
	saveDb();
	return t;
}

function updateTicket(userId, ticketId, patch) {
	const db = getDb_();
	const stmt = db.prepare('SELECT * FROM tickets WHERE id = ? AND userId = ?');
	const t = stmt.get(ticketId, userId);
	
	if (!t) return null;
	
	const next = { ...t, ...patch };
	const updateStmt = db.prepare('UPDATE tickets SET status = ?, usedAt = ? WHERE id = ?');
	updateStmt.run(next.status || t.status, next.usedAt || t.usedAt, ticketId);
	
	const getStmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
	const updated = getStmt.get(ticketId);
	saveDb();
	return updated;
}

function deleteUser(id) {
	const user = findUserById(id);
	if (!user) return null;
	const db = getDb_();
	// Related tables where userId appears. Best-effort cleanup; ignore errors for missing tables/columns.
	const deleteSpecs = [
		{ table: 'cars', column: 'userId' },
		{ table: 'tickets', column: 'userId' },
		{ table: 'favorites', column: 'userId' },
		{ table: 'reservations', column: 'userId' },
		{ table: 'walletBalance', column: 'userId' },
		{ table: 'loyaltyPoints', column: 'userId' },
		{ table: 'pointTransactions', column: 'userId' },
		{ table: 'support_tickets', column: 'userId' },
		{ table: 'support_messages', column: 'senderId' },
		{ table: 'chat_sessions', column: 'userId' },
		{ table: 'userPreferences', column: 'userId' },
		{ table: 'onboardingProgress', column: 'userId' },
		{ table: 'reminders', column: 'userId' },
		{ table: 'reminder_preferences', column: 'userId' },
	];
	for (const spec of deleteSpecs) {
		try {
			const stmt = db.prepare(`DELETE FROM ${spec.table} WHERE ${spec.column} = ?`);
			stmt.run(id);
		} catch (e) {
			// Silently ignore if table/column doesn't exist.
		}
	}
	try {
		const userStmt = db.prepare('DELETE FROM users WHERE id = ?');
		userStmt.run(id);
	} catch (e) {
		return null;
	}
	saveDb();
	return user; // return snapshot before deletion
}

module.exports = { createUser, findUserByEmail, findUserByUsername, findUserById, updateUser, listUsers, addCar, addTicket, updateTicket, deleteUser, getDb: getDb_ };


