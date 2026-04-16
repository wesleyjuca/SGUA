const fs = require('fs');
const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'sgua.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
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

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      uns TEXT,
      news TEXT,
      feeds TEXT,
      sols TEXT,
      users TEXT,
      secs TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const row = await get('SELECT id FROM app_state WHERE id = 1');
  if (!row) {
    await run(
      `INSERT INTO app_state (id, uns, news, feeds, sols, users, secs, updated_at)
       VALUES (1, '[]', '[]', '[]', '[]', '[]', '{}', datetime('now'))`
    );
  }
}

app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: DB_PATH, now: new Date().toISOString() });
});

app.get('/api/state', async (_req, res) => {
  try {
    const row = await get('SELECT * FROM app_state WHERE id = 1');
    if (!row) return res.status(404).json({ ok: false, error: 'Estado não encontrado' });

    res.json({
      ok: true,
      uns: safeJsonParse(row.uns, []),
      news: safeJsonParse(row.news, []),
      feeds: safeJsonParse(row.feeds, []),
      sols: safeJsonParse(row.sols, []),
      users: safeJsonParse(row.users, []),
      secs: safeJsonParse(row.secs, {}),
      updatedAt: row.updated_at
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/state', async (req, res) => {
  try {
    const payload = req.body || {};
    const cur = await get('SELECT * FROM app_state WHERE id = 1');

    const next = {
      uns: Array.isArray(payload.uns) ? payload.uns : safeJsonParse(cur.uns, []),
      news: Array.isArray(payload.news) ? payload.news : safeJsonParse(cur.news, []),
      feeds: Array.isArray(payload.feeds) ? payload.feeds : safeJsonParse(cur.feeds, []),
      sols: Array.isArray(payload.sols) ? payload.sols : safeJsonParse(cur.sols, []),
      users: Array.isArray(payload.users) ? payload.users : safeJsonParse(cur.users, []),
      secs: isPlainObject(payload.secs) ? payload.secs : safeJsonParse(cur.secs, {})
    };

    await run(
      `UPDATE app_state
          SET uns = ?, news = ?, feeds = ?, sols = ?, users = ?, secs = ?, updated_at = datetime('now')
        WHERE id = 1`,
      [
        JSON.stringify(next.uns),
        JSON.stringify(next.news),
        JSON.stringify(next.feeds),
        JSON.stringify(next.sols),
        JSON.stringify(next.users),
        JSON.stringify(next.secs)
      ]
    );

    res.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SGUA server rodando em http://localhost:${PORT}`);
      console.log(`SQLite: ${DB_PATH}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao iniciar banco de dados:', err);
    process.exit(1);
  });
