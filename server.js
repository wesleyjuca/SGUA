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

function decodeXmlEntities(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function pickTag(block, tags) {
  for (const tag of tags) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = block.match(re);
    if (match && match[1]) return decodeXmlEntities(match[1]).trim();
  }
  return '';
}

function parseRssXml(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') return [];
  const blocks = [];
  const itemRegex = /<(item|entry)([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = itemRegex.exec(xmlText))) {
    blocks.push(match[0]);
  }

  return blocks
    .map((block) => {
      const title = pickTag(block, ['title']);
      const description = pickTag(block, ['description', 'summary', 'content']);
      const contentEncoded = pickTag(block, ['content:encoded']);
      const link = pickTag(block, ['link', 'id']);
      const pubDate = pickTag(block, ['pubDate', 'published', 'updated', 'dc:date']);
      return {
        title,
        description: contentEncoded || description,
        link,
        pubDate
      };
    })
    .filter((item) => item.title);
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

app.get('/api/rss', async (req, res) => {
  try {
    const rssUrl = String(req.query.url || '').trim();
    if (!rssUrl) return res.status(400).json({ ok: false, error: 'Parâmetro url é obrigatório.' });
    if (!/^https?:\/\//i.test(rssUrl)) {
      return res.status(400).json({ ok: false, error: 'URL inválida. Use http:// ou https://.' });
    }

    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'SGUA-RSS-Sync/1.0',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      }
    });
    if (!response.ok) {
      return res.status(502).json({ ok: false, error: `Falha ao baixar feed (${response.status})` });
    }

    const xmlText = await response.text();
    const items = parseRssXml(xmlText).slice(0, 20);
    return res.json({ ok: true, items, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
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
      secs: payload.secs && typeof payload.secs === 'object' ? payload.secs : safeJsonParse(cur.secs, {})
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
