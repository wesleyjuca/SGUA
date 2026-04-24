const fs = require('fs');
const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.SGUA_DB_PATH
  ? path.resolve(process.env.SGUA_DB_PATH)
  : path.join(DATA_DIR, 'sgua.db');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function sanitizeText(value, max = 255) {
  const v = String(value || '').trim();
  return v.slice(0, max);
}

function parsePositiveId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

async function initDb() {
  await run('PRAGMA foreign_keys = ON');

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'viewer')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      latitude REAL,
      longitude REAL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      capacity INTEGER NOT NULL DEFAULT 0,
      current_occupancy INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS occupancy_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER NOT NULL,
      user_id INTEGER,
      organization_name TEXT NOT NULL,
      usage_type TEXT NOT NULL,
      start_date TEXT NOT NULL DEFAULT (date('now')),
      end_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(unit_id) REFERENCES units(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER NOT NULL,
      requester_name TEXT NOT NULL,
      requester_email TEXT,
      usage_type TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(unit_id) REFERENCES units(id) ON DELETE CASCADE
    )
  `);

  const admin = await get('SELECT id FROM users WHERE email = ?', ['admin@sema.ac.gov.br']);
  if (!admin) {
    await run('INSERT INTO users(name, email, role) VALUES (?, ?, ?)', [
      'Administrador SGUA',
      'admin@sema.ac.gov.br',
      'admin'
    ]);
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(PUBLIC_DIR));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dbPath: DB_PATH, now: new Date().toISOString() });
});

app.get('/api/meta/model', (_req, res) => {
  res.json({
    ok: true,
    entities: {
      users: ['id', 'name', 'email', 'role', 'created_at'],
      units: ['id', 'name', 'address', 'latitude', 'longitude', 'status', 'capacity', 'current_occupancy', 'created_at', 'updated_at'],
      occupancy_records: ['id', 'unit_id', 'user_id', 'organization_name', 'usage_type', 'start_date', 'end_date', 'active'],
      news: ['id', 'title', 'content', 'author_id', 'created_at'],
      requests: ['id', 'unit_id', 'requester_name', 'requester_email', 'usage_type', 'notes', 'status', 'created_at', 'updated_at']
    },
    relationships: [
      'occupancy_records.unit_id -> units.id (N:1)',
      'occupancy_records.user_id -> users.id (N:1)',
      'news.author_id -> users.id (N:1)',
      'requests.unit_id -> units.id (N:1)'
    ]
  });
});

// Users CRUD
app.get('/api/users', asyncRoute(async (_req, res) => {
  const rows = await all('SELECT * FROM users ORDER BY id DESC');
  res.json({ ok: true, data: rows });
}));

app.post('/api/users', asyncRoute(async (req, res) => {
  const name = sanitizeText(req.body.name, 120);
  const email = sanitizeText(req.body.email, 160).toLowerCase();
  const role = sanitizeText(req.body.role, 20) || 'viewer';

  if (!name) return res.status(400).json({ ok: false, error: 'Nome é obrigatório.' });
  if (!validateEmail(email)) return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
  if (!['admin', 'manager', 'viewer'].includes(role)) {
    return res.status(400).json({ ok: false, error: 'Perfil inválido.' });
  }

  const result = await run('INSERT INTO users(name, email, role) VALUES (?, ?, ?)', [name, email, role]);
  const created = await get('SELECT * FROM users WHERE id = ?', [result.lastID]);
  res.status(201).json({ ok: true, data: created });
}));

app.put('/api/users/:id', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await get('SELECT * FROM users WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });

  const name = sanitizeText(req.body.name ?? existing.name, 120);
  const email = sanitizeText(req.body.email ?? existing.email, 160).toLowerCase();
  const role = sanitizeText(req.body.role ?? existing.role, 20);

  if (!name || !validateEmail(email)) {
    return res.status(400).json({ ok: false, error: 'Dados de usuário inválidos.' });
  }
  if (!['admin', 'manager', 'viewer'].includes(role)) {
    return res.status(400).json({ ok: false, error: 'Perfil inválido.' });
  }

  await run('UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?', [name, email, role, id]);
  const updated = await get('SELECT * FROM users WHERE id = ?', [id]);
  res.json({ ok: true, data: updated });
}));

app.delete('/api/users/:id', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  await run('DELETE FROM users WHERE id = ?', [id]);
  res.json({ ok: true });
}));

// Units CRUD
app.get('/api/units', asyncRoute(async (_req, res) => {
  const rows = await all('SELECT * FROM units ORDER BY id DESC');
  res.json({ ok: true, data: rows });
}));

app.post('/api/units', asyncRoute(async (req, res) => {
  const payload = req.body || {};
  const name = sanitizeText(payload.name, 140);
  const address = sanitizeText(payload.address, 255);
  const latitude = payload.latitude == null || payload.latitude === '' ? null : Number(payload.latitude);
  const longitude = payload.longitude == null || payload.longitude === '' ? null : Number(payload.longitude);
  const status = payload.status === 'inactive' ? 'inactive' : 'active';
  const capacity = Math.max(0, Number(payload.capacity || 0));

  if (!name) return res.status(400).json({ ok: false, error: 'Nome da unidade é obrigatório.' });
  if (latitude != null && (Number.isNaN(latitude) || latitude < -90 || latitude > 90)) {
    return res.status(400).json({ ok: false, error: 'Latitude inválida.' });
  }
  if (longitude != null && (Number.isNaN(longitude) || longitude < -180 || longitude > 180)) {
    return res.status(400).json({ ok: false, error: 'Longitude inválida.' });
  }

  const result = await run(
    `INSERT INTO units(name, address, latitude, longitude, status, capacity, current_occupancy)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [name, address, latitude, longitude, status, capacity]
  );

  const created = await get('SELECT * FROM units WHERE id = ?', [result.lastID]);
  res.status(201).json({ ok: true, data: created });
}));

app.put('/api/units/:id', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await get('SELECT * FROM units WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Unidade não encontrada.' });

  const payload = req.body || {};
  const name = sanitizeText(payload.name ?? existing.name, 140);
  const address = sanitizeText(payload.address ?? existing.address, 255);
  const latitude = payload.latitude == null ? existing.latitude : Number(payload.latitude);
  const longitude = payload.longitude == null ? existing.longitude : Number(payload.longitude);
  const status = payload.status ? sanitizeText(payload.status, 16) : existing.status;
  const capacity = payload.capacity == null ? existing.capacity : Math.max(0, Number(payload.capacity));

  if (!name) return res.status(400).json({ ok: false, error: 'Nome da unidade é obrigatório.' });
  if (latitude != null && (Number.isNaN(latitude) || latitude < -90 || latitude > 90)) {
    return res.status(400).json({ ok: false, error: 'Latitude inválida.' });
  }
  if (longitude != null && (Number.isNaN(longitude) || longitude < -180 || longitude > 180)) {
    return res.status(400).json({ ok: false, error: 'Longitude inválida.' });
  }
  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Status inválido.' });
  }
  if (!Number.isFinite(capacity)) {
    return res.status(400).json({ ok: false, error: 'Capacidade inválida.' });
  }

  await run(
    `UPDATE units
     SET name = ?, address = ?, latitude = ?, longitude = ?, status = ?, capacity = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [name, address, latitude, longitude, status, capacity, id]
  );

  const updated = await get('SELECT * FROM units WHERE id = ?', [id]);
  res.json({ ok: true, data: updated });
}));

app.delete('/api/units/:id', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  await run('DELETE FROM units WHERE id = ?', [id]);
  res.json({ ok: true });
}));

// Occupancy operations
app.get('/api/units/:id/occupancy', asyncRoute(async (req, res) => {
  const unitId = Number(req.params.id);
  const rows = await all(
    `SELECT o.*, u.name AS user_name FROM occupancy_records o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.unit_id = ?
     ORDER BY o.id DESC`,
    [unitId]
  );
  res.json({ ok: true, data: rows });
}));

app.post('/api/units/:id/occupancy', asyncRoute(async (req, res) => {
  const unitId = parsePositiveId(req.params.id);
  if (!unitId) return res.status(400).json({ ok: false, error: 'ID da unidade inválido.' });
  const unit = await get('SELECT * FROM units WHERE id = ?', [unitId]);
  if (!unit) return res.status(404).json({ ok: false, error: 'Unidade não encontrada.' });
  if (unit.status === 'inactive') return res.status(400).json({ ok: false, error: 'Unidade inativa.' });

  const organizationName = sanitizeText(req.body.organization_name, 120);
  const usageType = sanitizeText(req.body.usage_type, 120);
  const userId = req.body.user_id ? parsePositiveId(req.body.user_id) : null;
  if (!organizationName || !usageType) {
    return res.status(400).json({ ok: false, error: 'organization_name e usage_type são obrigatórios.' });
  }
  if (req.body.user_id && !userId) {
    return res.status(400).json({ ok: false, error: 'user_id inválido.' });
  }
  if (userId) {
    const user = await get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ ok: false, error: 'Usuário não encontrado para vinculação.' });
  }

  if (unit.capacity > 0 && unit.current_occupancy >= unit.capacity) {
    return res.status(400).json({ ok: false, error: 'Capacidade máxima da unidade atingida.' });
  }

  await run('BEGIN IMMEDIATE TRANSACTION');
  try {
    await run(
      `INSERT INTO occupancy_records(unit_id, user_id, organization_name, usage_type)
       VALUES (?, ?, ?, ?)`,
      [unitId, userId, organizationName, usageType]
    );
    await run('UPDATE units SET current_occupancy = current_occupancy + 1, updated_at = datetime(\'now\') WHERE id = ?', [unitId]);
    await run('COMMIT');
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
  res.status(201).json({ ok: true });
}));

app.put('/api/occupancy/:id/checkout', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID de ocupação inválido.' });
  const record = await get('SELECT * FROM occupancy_records WHERE id = ?', [id]);
  if (!record) return res.status(404).json({ ok: false, error: 'Registro não encontrado.' });
  if (!record.active) return res.status(400).json({ ok: false, error: 'Registro já inativo.' });

  await run('BEGIN IMMEDIATE TRANSACTION');
  try {
    await run('UPDATE occupancy_records SET active = 0, end_date = date(\'now\') WHERE id = ?', [id]);
    await run(
      `UPDATE units
       SET current_occupancy = CASE WHEN current_occupancy > 0 THEN current_occupancy - 1 ELSE 0 END,
           updated_at = datetime('now')
       WHERE id = ?`,
      [record.unit_id]
    );
    await run('COMMIT');
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }

  res.json({ ok: true });
}));

// News CRUD
app.get('/api/news', asyncRoute(async (_req, res) => {
  const rows = await all(
    `SELECT n.*, u.name AS author_name
     FROM news n
     LEFT JOIN users u ON u.id = n.author_id
     ORDER BY n.id DESC`
  );
  res.json({ ok: true, data: rows });
}));

app.post('/api/news', asyncRoute(async (req, res) => {
  const title = sanitizeText(req.body.title, 180);
  const content = sanitizeText(req.body.content, 4000);
  const authorId = req.body.author_id ? Number(req.body.author_id) : null;
  if (!title || !content) return res.status(400).json({ ok: false, error: 'Título e conteúdo são obrigatórios.' });

  const result = await run('INSERT INTO news(title, content, author_id) VALUES (?, ?, ?)', [title, content, authorId]);
  const created = await get('SELECT * FROM news WHERE id = ?', [result.lastID]);
  res.status(201).json({ ok: true, data: created });
}));

app.put('/api/news/:id', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await get('SELECT * FROM news WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Notícia não encontrada.' });

  const title = sanitizeText(req.body.title ?? existing.title, 180);
  const content = sanitizeText(req.body.content ?? existing.content, 4000);
  await run('UPDATE news SET title = ?, content = ? WHERE id = ?', [title, content, id]);
  const updated = await get('SELECT * FROM news WHERE id = ?', [id]);
  res.json({ ok: true, data: updated });
}));

app.delete('/api/news/:id', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  await run('DELETE FROM news WHERE id = ?', [id]);
  res.json({ ok: true });
}));

// Requests CRUD
app.get('/api/requests', asyncRoute(async (_req, res) => {
  const rows = await all(
    `SELECT r.*, un.name AS unit_name
     FROM requests r
     INNER JOIN units un ON un.id = r.unit_id
     ORDER BY r.id DESC`
  );
  res.json({ ok: true, data: rows });
}));

app.post('/api/requests', asyncRoute(async (req, res) => {
  const unitId = parsePositiveId(req.body.unit_id);
  const requesterName = sanitizeText(req.body.requester_name, 120);
  const requesterEmail = sanitizeText(req.body.requester_email, 160).toLowerCase();
  const usageType = sanitizeText(req.body.usage_type, 120);
  const notes = sanitizeText(req.body.notes, 1500);

  if (!unitId || !requesterName || !usageType) {
    return res.status(400).json({ ok: false, error: 'unit_id, requester_name e usage_type são obrigatórios.' });
  }
  if (requesterEmail && !validateEmail(requesterEmail)) {
    return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
  }
  const unit = await get('SELECT id FROM units WHERE id = ?', [unitId]);
  if (!unit) return res.status(404).json({ ok: false, error: 'Unidade não encontrada para solicitação.' });

  const result = await run(
    `INSERT INTO requests(unit_id, requester_name, requester_email, usage_type, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [unitId, requesterName, requesterEmail || null, usageType, notes]
  );

  const created = await get('SELECT * FROM requests WHERE id = ?', [result.lastID]);
  res.status(201).json({ ok: true, data: created });
}));

app.put('/api/requests/:id', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await get('SELECT * FROM requests WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Solicitação não encontrada.' });

  const status = req.body.status || existing.status;
  const notes = sanitizeText(req.body.notes ?? existing.notes, 1500);
  const unitId = req.body.unit_id == null ? existing.unit_id : parsePositiveId(req.body.unit_id);
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Status inválido.' });
  }
  if (!unitId) return res.status(400).json({ ok: false, error: 'unit_id inválido.' });
  const unit = await get('SELECT id FROM units WHERE id = ?', [unitId]);
  if (!unit) return res.status(404).json({ ok: false, error: 'Unidade não encontrada para solicitação.' });

  await run(
    `UPDATE requests
     SET status = ?, notes = ?, unit_id = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [status, notes, unitId, id]
  );

  const updated = await get('SELECT * FROM requests WHERE id = ?', [id]);
  res.json({ ok: true, data: updated });
}));

app.delete('/api/requests/:id', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  await run('DELETE FROM requests WHERE id = ?', [id]);
  res.json({ ok: true });
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err && err.code === 'SQLITE_CONSTRAINT') {
    return res.status(409).json({ ok: false, error: 'Operação violou uma restrição de dados.' });
  }
  res.status(500).json({ ok: false, error: 'Erro interno no servidor.' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SGUA executando em http://localhost:${PORT}`);
      console.log(`Banco SQLite: ${DB_PATH}`);
    });
  })
  .catch((error) => {
    console.error('Falha ao inicializar aplicação:', error);
    process.exit(1);
  });
