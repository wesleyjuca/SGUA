'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads', 'photos');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype));
  }
});

if (!process.env.DATABASE_URL) {
  console.error('Erro: DATABASE_URL é obrigatória no ambiente.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

pool.on('error', (err) => {
  console.error('[Pool] Erro inesperado em cliente inativo:', err.message);
});

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── General helpers ──────────────────────────────────────────────────────────

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function sanitizeText(value, max = 255) {
  return String(value || '').trim().slice(0, max);
}

function parsePositiveId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isSafeUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function pgError(err, res) {
  if (err.code === '23505') {
    return res.status(409).json({ ok: false, error: 'Operação violou uma restrição de dados.' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ ok: false, error: 'Referência inválida.' });
  }
  console.error('[DB]', err.message);
  return res.status(500).json({ ok: false, error: 'Erro interno no servidor.' });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// ─── RSS helpers ─────────────────────────────────────────────────────────────

function decodeXmlEntities(input) {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return decodeXmlEntities(match ? match[1] : '');
}

function normalizeCategory(rawCategory) {
  const category = (rawCategory || '').toLowerCase();
  if (!category) return 'Monitoramento';
  if (category.includes('fiscal')) return 'Fiscalização';
  if (category.includes('legis')) return 'Legislação';
  if (category.includes('parceria')) return 'Parceria';
  if (category.includes('programa')) return 'Programa REM';
  if (category.includes('evento')) return 'Evento';
  if (category.includes('capac')) return 'Capacitação';
  if (category.includes('gest')) return 'Gestão';
  return 'Monitoramento';
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function normalizeDate(rawDate) {
  if (!rawDate) return today();
  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? today() : parsed.toISOString().split('T')[0];
}

async function fetchFeedItems(feed) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  try {
    const response = await fetch(feed.url, {
      headers: { 'User-Agent': 'SGUA-RSS-Sync/1.0 (+https://sema.ac.gov.br)' },
      signal: ctrl.signal
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const xml = await response.text();
    const items = [];

    // RSS 2.0 — <item>
    const itemRx = /<item\b[\s\S]*?<\/item>/gi;
    let match;
    while ((match = itemRx.exec(xml)) !== null) {
      const block = match[0];
      const title = extractTag(block, 'title');
      if (!title) continue;
      const rawLink = extractTag(block, 'link');
      items.push({
        title,
        description: extractTag(block, 'description'),
        link: isSafeUrl(rawLink) ? rawLink : '',
        date: normalizeDate(extractTag(block, 'pubDate')),
        category: normalizeCategory(extractTag(block, 'category') || feed.categoria),
        source: feed.nome
      });
      if (items.length >= 8) break;
    }

    // Atom — <entry> fallback (feeds gov.br, etc.)
    if (items.length === 0) {
      const entryRx = /<entry\b[\s\S]*?<\/entry>/gi;
      let em;
      while ((em = entryRx.exec(xml)) !== null) {
        const block = em[0];
        const title = extractTag(block, 'title');
        if (!title) continue;
        const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
        const rawLink = hrefMatch ? hrefMatch[1] : extractTag(block, 'link');
        items.push({
          title,
          description: extractTag(block, 'summary') || extractTag(block, 'content'),
          link: isSafeUrl(rawLink) ? rawLink : '',
          date: normalizeDate(extractTag(block, 'published') || extractTag(block, 'updated')),
          category: normalizeCategory(extractTag(block, 'category') || feed.categoria),
          source: feed.nome
        });
        if (items.length >= 8) break;
      }
    }

    return { ok: true, items };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json({ limit: '2mb' }));
app.use(express.static(PUBLIC_DIR));

// ─── Utility routes ───────────────────────────────────────────────────────────

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, db: 'postgresql', now: new Date().toISOString() });
}));

app.get('/api/meta/model', (_req, res) => {
  res.json({
    ok: true,
    entities: {
      users: ['id', 'name', 'email', 'role', 'created_at'],
      units: ['id', 'name', 'address', 'latitude', 'longitude', 'status', 'capacity', 'current_occupancy', 'created_at', 'updated_at'],
      occupancy_records: ['id', 'unit_id', 'user_id', 'organization_name', 'usage_type', 'start_date', 'end_date', 'active'],
      news: ['id', 'title', 'content', 'source', 'link', 'category', 'is_rss', 'author_id', 'created_at'],
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

// ─── Users CRUD ───────────────────────────────────────────────────────────────

app.get('/api/users', asyncRoute(async (_req, res) => {
  const data = await query('SELECT * FROM users ORDER BY id DESC');
  res.json({ ok: true, data });
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

  try {
    const data = await queryOne(
      'INSERT INTO users(name, email, role) VALUES ($1, $2, $3) RETURNING *',
      [name, email, role]
    );
    res.status(201).json({ ok: true, data });
  } catch (err) {
    return pgError(err, res);
  }
}));

app.put('/api/users/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });

  const existing = await queryOne('SELECT * FROM users WHERE id = $1', [id]);
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

  try {
    const data = await queryOne(
      'UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4 RETURNING *',
      [name, email, role, id]
    );
    res.json({ ok: true, data });
  } catch (err) {
    return pgError(err, res);
  }
}));

app.delete('/api/users/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  await query('DELETE FROM users WHERE id = $1', [id]);
  res.json({ ok: true });
}));

// ─── Units CRUD ───────────────────────────────────────────────────────────────

app.get('/api/units', asyncRoute(async (_req, res) => {
  const data = await query('SELECT * FROM units ORDER BY id DESC');
  res.json({ ok: true, data });
}));

app.post('/api/units', asyncRoute(async (req, res) => {
  const payload = req.body || {};
  const name = sanitizeText(payload.name, 140);
  const address = sanitizeText(payload.address, 255) || null;
  const latitude = payload.latitude == null || payload.latitude === '' ? null : Number(payload.latitude);
  const longitude = payload.longitude == null || payload.longitude === '' ? null : Number(payload.longitude);
  const status = payload.status === 'inactive' ? 'inactive' : 'active';
  const capacity = Number(payload.capacity ?? 0);

  if (!name) return res.status(400).json({ ok: false, error: 'Nome da unidade é obrigatório.' });
  if (!Number.isFinite(capacity) || capacity < 0) {
    return res.status(400).json({ ok: false, error: 'Capacidade inválida.' });
  }
  if (latitude != null && (Number.isNaN(latitude) || latitude < -90 || latitude > 90)) {
    return res.status(400).json({ ok: false, error: 'Latitude inválida.' });
  }
  if (longitude != null && (Number.isNaN(longitude) || longitude < -180 || longitude > 180)) {
    return res.status(400).json({ ok: false, error: 'Longitude inválida.' });
  }

  const data = await queryOne(
    `INSERT INTO units(name, address, latitude, longitude, status, capacity, current_occupancy)
     VALUES ($1, $2, $3, $4, $5, $6, 0) RETURNING *`,
    [name, address, latitude, longitude, status, Math.floor(capacity)]
  );
  res.status(201).json({ ok: true, data });
}));

app.put('/api/units/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });

  const existing = await queryOne('SELECT * FROM units WHERE id = $1', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Unidade não encontrada.' });

  const p = req.body || {};
  const name          = sanitizeText(p.name ?? existing.name, 140);
  const address       = sanitizeText(p.address ?? existing.address ?? '', 255) || null;
  const latitude      = p.latitude == null ? existing.latitude : Number(p.latitude);
  const longitude     = p.longitude == null ? existing.longitude : Number(p.longitude);
  const status        = p.status ? sanitizeText(p.status, 16) : existing.status;
  const capacity      = p.capacity == null ? existing.capacity : Number(p.capacity);
  const description   = sanitizeText(p.description ?? existing.description ?? '', 1000) || null;
  const contact_name  = sanitizeText(p.contact_name ?? existing.contact_name ?? '', 120) || null;
  const contact_email = sanitizeText(p.contact_email ?? existing.contact_email ?? '', 160).toLowerCase() || null;
  const contact_phone = sanitizeText(p.contact_phone ?? existing.contact_phone ?? '', 30) || null;

  if (!name) return res.status(400).json({ ok: false, error: 'Nome da unidade é obrigatório.' });
  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Status inválido.' });
  }
  if (!Number.isFinite(capacity) || capacity < 0) {
    return res.status(400).json({ ok: false, error: 'Capacidade inválida.' });
  }
  if (latitude != null && (Number.isNaN(latitude) || latitude < -90 || latitude > 90)) {
    return res.status(400).json({ ok: false, error: 'Latitude inválida.' });
  }
  if (longitude != null && (Number.isNaN(longitude) || longitude < -180 || longitude > 180)) {
    return res.status(400).json({ ok: false, error: 'Longitude inválida.' });
  }
  if (contact_email && !validateEmail(contact_email)) {
    return res.status(400).json({ ok: false, error: 'E-mail de contato inválido.' });
  }

  const data = await queryOne(
    `UPDATE units
     SET name=$1, address=$2, latitude=$3, longitude=$4, status=$5, capacity=$6,
         description=$7, contact_name=$8, contact_email=$9, contact_phone=$10
     WHERE id=$11 RETURNING *`,
    [name, address, latitude, longitude, status, Math.floor(capacity),
     description, contact_name, contact_email, contact_phone, id]
  );
  res.json({ ok: true, data });
}));

app.delete('/api/units/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  await query('DELETE FROM units WHERE id = $1', [id]);
  res.json({ ok: true });
}));

// ─── Occupancy operations ─────────────────────────────────────────────────────

app.get('/api/units/:id/occupancy', asyncRoute(async (req, res) => {
  const unitId = parsePositiveId(req.params.id);
  if (!unitId) return res.status(400).json({ ok: false, error: 'ID da unidade inválido.' });

  const data = await query(
    `SELECT o.*, u.name AS user_name
     FROM occupancy_records o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.unit_id = $1
     ORDER BY o.id DESC`,
    [unitId]
  );
  res.json({ ok: true, data });
}));

app.post('/api/units/:id/occupancy', asyncRoute(async (req, res) => {
  const unitId = parsePositiveId(req.params.id);
  if (!unitId) return res.status(400).json({ ok: false, error: 'ID da unidade inválido.' });

  const organizationName = sanitizeText(req.body.organization_name, 120);
  const usageType = sanitizeText(req.body.usage_type, 120);
  const userId = req.body.user_id ? parsePositiveId(req.body.user_id) : null;

  if (!organizationName || !usageType) {
    return res.status(400).json({ ok: false, error: 'organization_name e usage_type são obrigatórios.' });
  }
  if (req.body.user_id && !userId) {
    return res.status(400).json({ ok: false, error: 'user_id inválido.' });
  }

  try {
    await withTransaction(async (client) => {
      const { rows: [unit] } = await client.query(
        'SELECT * FROM units WHERE id = $1 FOR UPDATE', [unitId]
      );
      if (!unit) { const e = new Error('Unidade não encontrada.'); e.status = 404; throw e; }
      if (unit.status === 'inactive') { const e = new Error('Unidade inativa.'); e.status = 400; throw e; }
      if (userId) {
        const { rows } = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
        if (!rows.length) { const e = new Error('Usuário não encontrado para vinculação.'); e.status = 404; throw e; }
      }
      if (unit.capacity > 0 && unit.current_occupancy >= unit.capacity) {
        const e = new Error('Capacidade máxima da unidade atingida.'); e.status = 400; throw e;
      }
      await client.query(
        'INSERT INTO occupancy_records(unit_id, user_id, organization_name, usage_type) VALUES ($1, $2, $3, $4)',
        [unitId, userId, organizationName, usageType]
      );
      await client.query(
        'UPDATE units SET current_occupancy = current_occupancy + 1 WHERE id = $1', [unitId]
      );
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    throw err;
  }
}));

app.put('/api/occupancy/:id/checkout', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID de ocupação inválido.' });

  try {
    await withTransaction(async (client) => {
      const { rows: [record] } = await client.query(
        'SELECT * FROM occupancy_records WHERE id = $1 FOR UPDATE', [id]
      );
      if (!record) { const e = new Error('Registro não encontrado.'); e.status = 404; throw e; }
      if (!record.active) { const e = new Error('Registro já inativo.'); e.status = 400; throw e; }
      await client.query(
        'UPDATE occupancy_records SET active = FALSE, end_date = CURRENT_DATE WHERE id = $1', [id]
      );
      await client.query(
        'UPDATE units SET current_occupancy = GREATEST(0, current_occupancy - 1) WHERE id = $1',
        [record.unit_id]
      );
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    throw err;
  }
}));

// ─── News CRUD ────────────────────────────────────────────────────────────────

app.get('/api/news', asyncRoute(async (_req, res) => {
  const data = await query(
    `SELECT n.id, n.title, n.content, n.source, n.link, n.category, n.is_rss,
            n.created_at, u.name AS author_name
     FROM news n
     LEFT JOIN users u ON u.id = n.author_id
     ORDER BY n.id DESC`
  );
  res.json({ ok: true, data });
}));

app.post('/api/news', asyncRoute(async (req, res) => {
  const title = sanitizeText(req.body.title, 180);
  const content = sanitizeText(req.body.content, 4000);
  const author_id = parsePositiveId(req.body.author_id);

  if (!title || !content) {
    return res.status(400).json({ ok: false, error: 'Título e conteúdo são obrigatórios.' });
  }

  const data = await queryOne(
    'INSERT INTO news(title, content, author_id) VALUES ($1, $2, $3) RETURNING *',
    [title, content, author_id]
  );
  res.status(201).json({ ok: true, data });
}));

app.put('/api/news/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });

  const existing = await queryOne('SELECT * FROM news WHERE id = $1', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Notícia não encontrada.' });

  const title = sanitizeText(req.body.title ?? existing.title, 180);
  const content = sanitizeText(req.body.content ?? existing.content, 4000);

  const data = await queryOne(
    'UPDATE news SET title = $1, content = $2 WHERE id = $3 RETURNING *',
    [title, content, id]
  );
  res.json({ ok: true, data });
}));

app.delete('/api/news/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  await query('DELETE FROM news WHERE id = $1', [id]);
  res.json({ ok: true });
}));

// ─── Requests CRUD ────────────────────────────────────────────────────────────

app.get('/api/requests', asyncRoute(async (_req, res) => {
  const data = await query(
    `SELECT r.*, un.name AS unit_name
     FROM requests r
     INNER JOIN units un ON un.id = r.unit_id
     ORDER BY r.id DESC`
  );
  res.json({ ok: true, data });
}));

app.post('/api/requests', asyncRoute(async (req, res) => {
  const unit_id = parsePositiveId(req.body.unit_id);
  const requester_name = sanitizeText(req.body.requester_name, 120);
  const requester_email = sanitizeText(req.body.requester_email, 160).toLowerCase() || null;
  const usage_type = sanitizeText(req.body.usage_type, 120);
  const notes = sanitizeText(req.body.notes, 1500) || null;

  if (!unit_id || !requester_name || !usage_type) {
    return res.status(400).json({ ok: false, error: 'unit_id, requester_name e usage_type são obrigatórios.' });
  }
  if (requester_email && !validateEmail(requester_email)) {
    return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
  }

  const unit = await queryOne('SELECT id FROM units WHERE id = $1', [unit_id]);
  if (!unit) return res.status(404).json({ ok: false, error: 'Unidade não encontrada para solicitação.' });

  const data = await queryOne(
    `INSERT INTO requests(unit_id, requester_name, requester_email, usage_type, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [unit_id, requester_name, requester_email, usage_type, notes]
  );
  res.status(201).json({ ok: true, data });
}));

app.put('/api/requests/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });

  const existing = await queryOne('SELECT * FROM requests WHERE id = $1', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Solicitação não encontrada.' });

  const status = req.body.status || existing.status;
  const notes = sanitizeText(req.body.notes ?? existing.notes, 1500) || null;
  const unit_id = req.body.unit_id == null ? existing.unit_id : parsePositiveId(req.body.unit_id);

  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Status inválido.' });
  }
  if (!unit_id) return res.status(400).json({ ok: false, error: 'unit_id inválido.' });

  const unit = await queryOne('SELECT id FROM units WHERE id = $1', [unit_id]);
  if (!unit) return res.status(404).json({ ok: false, error: 'Unidade não encontrada para solicitação.' });

  const data = await queryOne(
    'UPDATE requests SET status = $1, notes = $2, unit_id = $3 WHERE id = $4 RETURNING *',
    [status, notes, unit_id, id]
  );
  res.json({ ok: true, data });
}));

app.delete('/api/requests/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  await query('DELETE FROM requests WHERE id = $1', [id]);
  res.json({ ok: true });
}));

// ─── RSS Feed sync ────────────────────────────────────────────────────────────

app.post('/api/feeds/sync', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const feeds = Array.isArray(body.feeds) ? body.feeds : [];
  const activeFeeds = feeds.filter((f) => f && f.ativo && typeof f.url === 'string' && f.url.trim());

  if (!activeFeeds.length) {
    return res.json({ ok: true, feeds, added: 0, warnings: ['Nenhum feed ativo para sincronizar.'] });
  }

  const warnings = [];
  const feedUpdates = new Map();
  const toInsert = [];

  await Promise.all(
    activeFeeds.map(async (feed) => {
      const result = await fetchFeedItems(feed);
      if (!result.ok) {
        warnings.push(`Falha no feed "${feed.nome}": ${result.error}`);
        return;
      }
      feedUpdates.set(feed.id, today());
      result.items.forEach((item) => {
        toInsert.push({
          title: item.title.slice(0, 180),
          content: (item.description || item.title).slice(0, 4000),
          source: item.source,
          link: item.link || null,
          category: item.category
        });
      });
    })
  );

  let added = 0;
  for (const item of toInsert) {
    const { rowCount } = await pool.query(
      `INSERT INTO news (title, content, source, link, category, is_rss)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (title, source) DO NOTHING`,
      [item.title, item.content, item.source, item.link, item.category]
    );
    added += rowCount;
  }

  const mergedFeeds = feeds.map((f) =>
    feedUpdates.has(f.id) ? { ...f, sync: feedUpdates.get(f.id) } : f
  );

  return res.json({ ok: true, feeds: mergedFeeds, added, warnings });
}));

// ─── Unit Photos ─────────────────────────────────────────────────────────────

app.get('/api/units/:id/photos', asyncRoute(async (req, res) => {
  const unitId = parsePositiveId(req.params.id);
  if (!unitId) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const data = await query(
    'SELECT * FROM unit_photos WHERE unit_id = $1 ORDER BY id DESC', [unitId]
  );
  res.json({ ok: true, data });
}));

app.post('/api/units/:id/photos', upload.single('photo'), asyncRoute(async (req, res) => {
  const unitId = parsePositiveId(req.params.id);
  if (!unitId || !req.file) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ ok: false, error: 'Unidade ou arquivo inválido.' });
  }
  const unit = await queryOne('SELECT id FROM units WHERE id = $1', [unitId]);
  if (!unit) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ ok: false, error: 'Unidade não encontrada.' });
  }
  const url = `/uploads/photos/${req.file.filename}`;
  const caption = sanitizeText(req.body.caption || '', 200) || null;
  const isBanner = req.body.is_banner === 'true';
  const data = await queryOne(
    'INSERT INTO unit_photos(unit_id, url, filename, caption, is_banner) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [unitId, url, req.file.filename, caption, isBanner]
  );
  if (isBanner) {
    await query('UPDATE units SET banner_url = $1 WHERE id = $2', [url, unitId]);
  }
  res.status(201).json({ ok: true, data });
}));

app.delete('/api/photos/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const photo = await queryOne('SELECT * FROM unit_photos WHERE id = $1', [id]);
  if (!photo) return res.status(404).json({ ok: false, error: 'Foto não encontrada.' });
  fs.unlink(path.join(UPLOADS_DIR, photo.filename), () => {});
  if (photo.is_banner) {
    await query('UPDATE units SET banner_url = NULL WHERE id = $1', [photo.unit_id]);
  }
  await query('DELETE FROM unit_photos WHERE id = $1', [id]);
  res.json({ ok: true });
}));

app.put('/api/photos/:id/banner', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const photo = await queryOne('SELECT * FROM unit_photos WHERE id = $1', [id]);
  if (!photo) return res.status(404).json({ ok: false, error: 'Foto não encontrada.' });
  await query('UPDATE unit_photos SET is_banner = false WHERE unit_id = $1', [photo.unit_id]);
  await query('UPDATE unit_photos SET is_banner = true WHERE id = $1', [id]);
  await query('UPDATE units SET banner_url = $1 WHERE id = $2', [photo.url, photo.unit_id]);
  res.json({ ok: true });
}));

// ─── SPA fallback (somente rotas não-API) ─────────────────────────────────────

app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  const code = err.code || '';
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
    return res.status(503).json({ ok: false, error: 'Serviço de banco de dados indisponível.' });
  }
  console.error(err);
  res.status(500).json({ ok: false, error: 'Erro interno no servidor.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`SGUA executando em http://localhost:${PORT}`);
  console.log(`Banco: PostgreSQL (Supabase)`);
});
