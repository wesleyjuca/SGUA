'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const cron = require('node-cron');
let nodemailer; try { nodemailer = require('nodemailer'); } catch(e) { nodemailer = null; }
const { Pool } = require('pg');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {ok: false, error: 'Muitas requisições. Tente novamente em 15 minutos.'}
});
app.use('/api/', limiter);

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: {ok: false, error: 'Limite de escrita atingido.'}
});
app.use(['/api/state', '/api/users', '/api/units'], writeLimiter);

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
  connectionTimeoutMillis: 10_000
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
        source: feed.nome,
        source_name: feed.nome,
        categoria: feed.categoria || 'Gestão'
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
          source: feed.nome,
          source_name: feed.nome,
          categoria: feed.categoria || 'Gestão'
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

// CORS para GitHub Pages (frontend estático em wesleyjuca.github.io)
app.use((req, res, next) => {
  const allowed = ['https://wesleyjuca.github.io', 'http://localhost:3000'];
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(PUBLIC_DIR));

// ─── Utility routes ───────────────────────────────────────────────────────────

// Healthcheck leve — Railway/Render precisam de 200 para considerar o deploy bem-sucedido
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Status detalhado do banco (não bloqueia o deploy)
app.get('/api/health/db', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'postgresql', now: new Date().toISOString() });
  } catch (err) {
    console.error('[Health/DB]', err.message);
    res.status(503).json({ ok: false, error: 'Serviço de banco de dados indisponível.', detail: err.message });
  }
});

// Diagnóstico de conexão — mostra host/usuário sem expor a senha
app.get('/api/debug/db', (_req, res) => {
  try {
    const url = new URL(process.env.DATABASE_URL || '');
    res.json({
      host: url.hostname,
      port: url.port,
      user: url.username,
      database: url.pathname.replace('/', ''),
      ssl: 'rejectUnauthorized=false'
    });
  } catch {
    res.status(500).json({ error: 'DATABASE_URL inválida ou ausente', raw_prefix: (process.env.DATABASE_URL || '').slice(0, 30) });
  }
});

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
  const photos = await query('SELECT filename FROM unit_photos WHERE unit_id = $1', [id]);
  photos.forEach((p) => {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, p.filename)); } catch {}
  });
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

// ─── App State (full JSON blob for React SPA) ─────────────────────────────────

app.get('/api/state', asyncRoute(async (_req, res) => {
  const row = await queryOne("SELECT value FROM app_state WHERE key = 'sgua'");
  if (row) return res.json(row.value);

  // Bootstrap from existing tables on first call
  const [units, newsRows, reqs, userRows] = await Promise.all([
    query('SELECT * FROM units ORDER BY id'),
    query('SELECT n.*, u.name AS author_name FROM news n LEFT JOIN users u ON u.id = n.author_id ORDER BY n.created_at DESC'),
    query('SELECT r.*, u.name AS unit_name FROM requests r JOIN units u ON u.id = r.unit_id ORDER BY r.created_at DESC'),
    query('SELECT * FROM users ORDER BY id'),
  ]);

  const uns = units.map((u) => ({
    id: u.id,
    tipo: /^UGAI/i.test(u.name) ? 'UGAI' : 'CIMA',
    nome: u.name,
    municipio: u.address || '',
    regional: '',
    coords: { lat: u.latitude ?? -9.97, lng: u.longitude ?? -67.81 },
    status: u.status === 'active' ? 'ativo' : u.status === 'inactive' ? 'inativo' : 'manutencao',
    taxaUso: u.capacity > 0 ? Math.round((u.current_occupancy / u.capacity) * 100) : 0,
    ag: u.current_occupancy || 0,
    descricao: u.description || '',
    historia: '',
    decreto: '',
    orgaos: [],
    quartos: 0,
    salas: 0,
    cozinha: false,
    auditorio: false,
    foto: u.banner_url || '',
    galeria: [],
    extras: [],
    visivel: true,
    orgaosPresentes: [],
    ocupacaoAtual: u.current_occupancy || 0,
  }));

  const news = newsRows.map((n) => ({
    id: n.id,
    titulo: n.title,
    resumo: (n.content || '').replace(/<[^>]+>/g, '').slice(0, 120),
    conteudo: n.content || '',
    data: (n.created_at || '').slice(0, 10),
    categoria: n.category || 'Gestão',
    unidade: '',
    destaque: false,
    visivel: true,
    fonte: n.source || '',
    autor: n.author_name || '',
    link: n.link || '',
  }));

  const sols = reqs.map((r) => ({
    id: r.id,
    sol: r.requester_name,
    org: r.requester_name,
    un: r.unit_name,
    ev: r.usage_type,
    dt: (r.created_at || '').slice(0, 10),
    st: r.status === 'approved' ? 'aprovada' : r.status === 'rejected' ? 'rejeitada' : 'pendente',
    notes: r.notes || '',
  }));

  const users = userRows.map((u) => ({
    id: u.id,
    nome: u.name,
    email: u.email,
    perfil: u.role === 'admin' ? 'admin' : 'viewer',
    ativo: true,
    criadoEm: (u.created_at || '').slice(0, 10),
  }));

  const state = {
    uns,
    news,
    feeds: [
      { id: 1, nome: 'Portal SEMA/AC', url: 'https://sema.ac.gov.br/feed', ativo: true, categoria: 'Gestão', sync: '—' },
      { id: 2, nome: 'INPE — Amazônia', url: 'https://www.inpe.br/rss/noticias.php', ativo: true, categoria: 'Monitoramento', sync: '—' },
      { id: 3, nome: 'MMA', url: 'https://www.gov.br/mma/pt-br/RSS', ativo: false, categoria: 'Legislação', sync: '—' },
    ],
    sols,
    users,
    secs: { hero: true, alert: true, bloco: true, mapa: true, dash: true, acesso: true, news: true, ia: false },
  };
  res.json(state);
}));

app.put('/api/state', asyncRoute(async (req, res) => {
  const state = req.body;
  if (!state || typeof state !== 'object') return res.status(400).json({ ok: false, error: 'Payload inválido.' });
  await query(
    "INSERT INTO app_state (key, value, updated_at) VALUES ('sgua', $1, now()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()",
    [JSON.stringify(state)]
  );
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
          source_name: item.source_name || feed.nome,
          link: item.link || null,
          category: item.category,
          categoria: item.categoria || feed.categoria || 'Gestão',
          pub_date: item.date || null
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

  const mergedFeeds = feeds.map((f) => {
    if (feedUpdates.has(f.id)) {
      return { ...f, sync: feedUpdates.get(f.id), lastStatus: 'ok', lastError: '' };
    }
    const warn = warnings.find(w => w.startsWith(`Falha no feed "${f.nome}"`));
    if (warn) {
      return { ...f, lastStatus: warn.includes('timeout') ? 'timeout' : 'erro', lastError: warn };
    }
    return f;
  });

  return res.json({ ok: true, feeds: mergedFeeds, added, warnings, items: toInsert });
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

app.post('/api/upload/photo', upload.single('photo'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Nenhuma imagem enviada.' });
  res.json({ ok: true, url: '/uploads/photos/' + req.file.filename });
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

// ─── Backup ──────────────────────────────────────────────────────────────────

app.get('/api/backup', asyncRoute(async (_req, res) => {
  const rows = await query('SELECT id, created_at, label, size_kb FROM sgua_backups ORDER BY created_at DESC LIMIT 50');
  res.json({ ok: true, data: rows });
}));

app.post('/api/backup', asyncRoute(async (req, res) => {
  const row = await queryOne("SELECT value FROM app_state WHERE key = 'sgua'");
  if (!row) return res.status(404).json({ ok: false, error: 'Estado não encontrado.' });
  const json = JSON.stringify(row.value);
  const sizeKb = Math.ceil(Buffer.byteLength(json, 'utf8') / 1024);
  const label = sanitizeText(req.body && req.body.label ? req.body.label : '', 160)
    || `Manual — ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' })}`;
  const result = await queryOne(
    'INSERT INTO sgua_backups (label, snapshot, size_kb) VALUES ($1, $2, $3) RETURNING id, created_at, label, size_kb',
    [label, row.value, sizeKb]
  );
  res.status(201).json({ ok: true, data: result });
}));

app.get('/api/backup/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const row = await queryOne('SELECT * FROM sgua_backups WHERE id = $1', [id]);
  if (!row) return res.status(404).json({ ok: false, error: 'Backup não encontrado.' });
  res.json({ ok: true, data: row });
}));

app.post('/api/backup/:id/restore', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const backup = await queryOne('SELECT snapshot FROM sgua_backups WHERE id = $1', [id]);
  if (!backup) return res.status(404).json({ ok: false, error: 'Backup não encontrado.' });
  await query(
    "INSERT INTO app_state (key, value, updated_at) VALUES ('sgua', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [JSON.stringify(backup.snapshot)]
  );
  res.json({ ok: true });
}));

app.delete('/api/backup/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  await query('DELETE FROM sgua_backups WHERE id = $1', [id]);
  res.json({ ok: true });
}));

// ─── Solicitações de Cadastro Público ────────────────────────────────────────

app.get('/api/reg-requests', asyncRoute(async (_req, res) => {
  const rows = await query('SELECT * FROM sgua_reg_requests ORDER BY created_at DESC');
  res.json({ ok: true, data: rows });
}));

app.post('/api/reg-requests', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const nome = sanitizeText(body.nome || '', 120);
  const email = sanitizeText(body.email || '', 160).toLowerCase();
  if (!nome || !email) return res.status(400).json({ ok: false, error: 'Nome e e-mail são obrigatórios.' });
  if (!validateEmail(email)) return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
  const result = await queryOne(
    'INSERT INTO sgua_reg_requests (nome, email, cargo, organizacao, justificativa) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [nome, email, sanitizeText(body.cargo||'',80), sanitizeText(body.organizacao||'',120), sanitizeText(body.justificativa||'',600)]
  );
  res.status(201).json({ ok: true, data: result });
}));

app.put('/api/reg-requests/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const body = req.body || {};
  const status = body.status;
  if (!['aprovado','rejeitado'].includes(status)) return res.status(400).json({ ok: false, error: 'Status inválido.' });
  const result = await queryOne(
    'UPDATE sgua_reg_requests SET status=$1, obs=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$4 RETURNING *',
    [status, sanitizeText(body.obs||'',500), body.reviewed_by||null, id]
  );
  if (!result) return res.status(404).json({ ok: false, error: 'Solicitação não encontrada.' });
  res.json({ ok: true, data: result });
}));

// ─── Notificações ─────────────────────────────────────────────────────────────

app.get('/api/notifications', asyncRoute(async (req, res) => {
  const rawId = req.query.user_id;
  const parsed = rawId !== undefined ? Number(rawId) : null;
  let rows;
  if (parsed === 0 || parsed === null) {
    rows = await query('SELECT * FROM sgua_notifications ORDER BY created_at DESC LIMIT 100');
  } else {
    if (!Number.isInteger(parsed) || parsed <= 0)
      return res.status(400).json({ ok: false, error: 'user_id inválido.' });
    rows = await query('SELECT * FROM sgua_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [parsed]);
  }
  res.json({ ok: true, data: rows });
}));

app.post('/api/notifications', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const result = await queryOne(
    'INSERT INTO sgua_notifications (user_id, tipo, canal, titulo, corpo) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [body.user_id||null, sanitizeText(body.tipo||'sistema',40), sanitizeText(body.canal||'sistema',20),
     sanitizeText(body.titulo||'',200), sanitizeText(body.corpo||'',600)]
  );
  res.status(201).json({ ok: true, data: result });
}));

app.put('/api/notifications/read-all', asyncRoute(async (req, res) => {
  const userId = parsePositiveId((req.body||{}).user_id);
  if (!userId) return res.status(400).json({ ok: false, error: 'user_id inválido.' });
  await query('UPDATE sgua_notifications SET lida=true WHERE user_id=$1', [userId]);
  res.json({ ok: true });
}));

app.put('/api/notifications/:id/read', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  await query('UPDATE sgua_notifications SET lida=true WHERE id=$1', [id]);
  res.json({ ok: true });
}));

// ─── Sugestões inteligentes ───────────────────────────────────────────────────

app.get('/api/suggestions', asyncRoute(async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM sgua_suggestions ORDER BY created_at DESC LIMIT 200');
    res.json({ ok: true, items: rows || [] });
  } catch(e) { res.json({ ok: false, error: e.message, items: [] }); }
}));

app.post('/api/suggestions', asyncRoute(async (req, res) => {
  try {
    const body = req.body || {};
    const texto = sanitizeText(body.texto || '', 500);
    if(!texto) return res.json({ ok: false, error: 'texto obrigatório' });
    const tipo = sanitizeText(body.tipo || 'sistema', 40);
    const prioridade = sanitizeText(body.prioridade || 'media', 20);
    const impacto = sanitizeText(body.impacto || '', 300);
    const obs = sanitizeText(body.obs || '', 500);
    const tags = Array.isArray(body.tags) ? body.tags.slice(0,10).map(t=>String(t).slice(0,50)) : [];
    await pool.query(
      'INSERT INTO sgua_suggestions (texto, tipo, status, prioridade, impacto, obs, tags) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [texto, tipo, 'pendente', prioridade, impacto, obs, JSON.stringify(tags)]
    );
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
}));

app.put('/api/suggestions/:id', asyncRoute(async (req, res) => {
  try {
    const id = parsePositiveId(req.params.id);
    if(!id) return res.json({ ok: false, error: 'ID inválido' });
    const body = req.body || {};
    const fields = [];
    const vals = [];
    const VALID_STATUS=['pendente','sugerida','em-analise','aplicada','implementada','descartada','ignorada'];
    const VALID_PRIO=['alta','media','baixa'];
    if(body.status!==undefined&&!VALID_STATUS.includes(body.status))
      return res.status(400).json({ok:false,error:'Status inválido.'});
    if(body.prioridade!==undefined&&!VALID_PRIO.includes(body.prioridade))
      return res.status(400).json({ok:false,error:'Prioridade inválida.'});
    if(body.status !== undefined){ fields.push('status=$'+(fields.length+1)); vals.push(sanitizeText(body.status,20)); }
    if(body.prioridade !== undefined){ fields.push('prioridade=$'+(fields.length+1)); vals.push(sanitizeText(body.prioridade,20)); }
    if(body.obs !== undefined){ fields.push('obs=$'+(fields.length+1)); vals.push(sanitizeText(body.obs,500)); }
    if(!fields.length) return res.json({ ok: false, error: 'Nenhum campo para atualizar.' });
    vals.push(id);
    await pool.query('UPDATE sgua_suggestions SET '+fields.join(',')+' WHERE id=$'+vals.length, vals);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
}));

// ─── E-mail ───────────────────────────────────────────────────────────────────

function createTransporter() {
  if (!nodemailer) return null;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
}

app.get('/api/email/config', (_req, res) => {
  const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const host = process.env.SMTP_HOST || '';
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  res.json({
    ok: true,
    configured,
    host: configured ? host.replace(/(.{3}).+(.{3})/, '$1***$2') : '',
    from: configured ? from.replace(/(.{2}).+(@.+)/, '$1***$2') : ''
  });
});

app.post('/api/email/test', asyncRoute(async (req, res) => {
  const to = sanitizeText((req.body||{}).to || '', 200);
  if (!to || !to.includes('@')) return res.json({ ok: false, error: 'E-mail inválido.' });
  const transporter = createTransporter();
  if (!transporter) return res.json({ ok: false, error: 'SMTP não configurado. Defina SMTP_HOST, SMTP_USER, SMTP_PASS no .env do servidor.' });
  const t0 = Date.now();
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: 'SGUA — Teste de envio de e-mail',
      html: '<p>Este é um e-mail de teste enviado pelo sistema SGUA.</p><p><small>'+new Date().toLocaleString('pt-BR')+'</small></p>'
    });
    res.json({ ok: true, messageId: info.messageId, ms: Date.now() - t0 });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
}));

app.post('/api/email/send', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const to = sanitizeText(body.to || '', 200);
  const subject = sanitizeText(body.subject || 'Notificação SGUA', 200);
  const html = sanitizeText(body.html || body.body || '', 5000);
  if (!to || !to.includes('@')) return res.json({ ok: false, error: 'E-mail inválido.' });
  if (!html) return res.json({ ok: false, error: 'Conteúdo vazio.' });
  const transporter = createTransporter();
  if (!transporter) return res.json({ ok: false, error: 'SMTP não configurado.' });
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to, subject, html
      });
      await query(
        'INSERT INTO sgua_notifications (user_id, tipo, canal, titulo, corpo) VALUES ($1,$2,$3,$4,$5)',
        [body.user_id || null, 'email', 'email', subject.slice(0,200), ('Enviado para: '+to).slice(0,600)]
      ).catch(() => {});
      return res.json({ ok: true, messageId: info.messageId, attempt });
    } catch(e) {
      lastErr = e.message;
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  res.json({ ok: false, error: lastErr, attempts: 3 });
}));

// ─── SPA fallback (somente rotas não-API) ─────────────────────────────────────

app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();
  const severity = err.severity || '';
  const isDbErr = code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND'
    || severity === 'FATAL' || severity === 'ERROR'
    || msg.includes('timeout') || msg.includes('terminated') || msg.includes('connect')
    || msg.includes('tenant') || msg.includes('user not found')
    || msg.includes('password') || msg.includes('ssl') || msg.includes('database');
  if (isDbErr) {
    console.error('[DB]', err.message);
    return res.status(503).json({ ok: false, error: 'Serviço de banco de dados indisponível.' });
  }
  console.error(err);
  res.status(500).json({ ok: false, error: 'Erro interno no servidor.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`SGUA executando em http://localhost:${PORT}`);
  console.log(`Banco: PostgreSQL (Supabase)`);
  if (process.env.RENDER) {
    console.warn('[Aviso] Render.com free tier: uploads de fotos em disco são temporários e serão perdidos a cada redeploy. Configure um Persistent Disk ou migre para Supabase Storage para fotos permanentes.');
  }
});

// ─── Backup semanal automático (toda domingo às 02:00 horário de Brasília / 07:00 UTC) ────

cron.schedule('0 7 * * 0', async () => {
  try {
    const row = await queryOne("SELECT value FROM app_state WHERE key = 'sgua'");
    if (!row) { console.warn('[Backup] app_state não encontrado.'); return; }
    const json = JSON.stringify(row.value);
    const sizeKb = Math.ceil(Buffer.byteLength(json, 'utf8') / 1024);
    const label = `Auto — ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' })}`;
    await query('INSERT INTO sgua_backups (label, snapshot, size_kb) VALUES ($1, $2, $3)', [label, row.value, sizeKb]);
    // Retenção: manter apenas os 30 backups mais recentes
    await query('DELETE FROM sgua_backups WHERE id NOT IN (SELECT id FROM sgua_backups ORDER BY created_at DESC LIMIT 30)');
    console.log(`[Backup] Automático concluído — ${sizeKb} KB`);
  } catch (err) {
    console.error('[Backup] Falha no backup automático:', err.message);
  }
}, { timezone: 'UTC' });

// Cron: daily 06:00 UTC — sincronizar RSS feeds
cron.schedule('0 6 * * *', async () => {
  try {
    const row = await queryOne("SELECT value FROM app_state WHERE key='sgua'");
    const state = row ? row.value : {};
    const feeds = (state.feeds||[]).filter(f => f.ativo && f.url);
    if(!feeds.length){console.log('[CRON-RSS] Sem feeds ativos');return;}
    let totalAdded=0, warnings=[];
    for(const f of feeds){
      try{
        const result = await fetchFeedItems(f);
        if(!result.ok){ warnings.push(f.nome+': '+result.error); continue; }
        const existTitles = new Set((state.news||[]).map(n=>n.titulo));
        const novas = result.items.filter(i=>!existTitles.has(i.title)).map(i=>({
          id: Date.now()+Math.random(), titulo:i.title, resumo:(i.description||'').slice(0,200),
          conteudo:i.description||'', data:i.date?i.date.slice(0,10):new Date().toISOString().slice(0,10),
          categoria:f.categoria||'Gestão', unidade:'', destaque:false, visivel:true,
          fonte:f.nome, autor:f.nome, orgaosPresentes:[], ocupacaoAtual:0
        }));
        state.news = (state.news||[]).concat(novas);
        state.feeds = (state.feeds||[]).map(fd=>fd.id===f.id?{...fd,sync:new Date().toISOString().slice(0,10)}:fd);
        totalAdded += novas.length;
      } catch(e){warnings.push(f.nome+': '+e.message);}
    }
    await query("INSERT INTO app_state (key, value, updated_at) VALUES ('sgua', $1, now()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()",[JSON.stringify(state)]);
    console.log(`[CRON-RSS] ${totalAdded} novas notícias. Avisos: ${warnings.length}`);
  } catch(e){console.error('[CRON-RSS] Falha:',e.message);}
}, { timezone: 'UTC' });
