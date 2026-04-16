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

function normalizeDate(rawDate) {
  if (!rawDate) return new Date().toISOString().split('T')[0];
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().split('T')[0];
  return parsed.toISOString().split('T')[0];
}

async function fetchFeedItems(feed) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  try {
    const response = await fetch(feed.url, {
      headers: { 'User-Agent': 'SGUA-RSS-Sync/1.0 (+https://sema.ac.gov.br)' },
      signal: ctrl.signal
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const xml = await response.text();
    const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
    const items = [];
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[0];
      const title = extractTag(block, 'title');
      if (!title) continue;
      const description = extractTag(block, 'description');
      const link = extractTag(block, 'link');
      const pubDate = extractTag(block, 'pubDate');
      const category = extractTag(block, 'category');
      items.push({
        title,
        description,
        link,
        date: normalizeDate(pubDate),
        category: normalizeCategory(category || feed.categoria),
        source: feed.nome
      });
      if (items.length >= 8) break;
    }
    return { ok: true, items };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timeout);
  }
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

app.post('/api/feeds/sync', async (req, res) => {
  try {
    const body = req.body || {};
    const feeds = Array.isArray(body.feeds) ? body.feeds : [];
    const currentNews = Array.isArray(body.news) ? body.news : [];
    const activeFeeds = feeds.filter((feed) => feed && feed.ativo && typeof feed.url === 'string' && feed.url.trim());

    if (!activeFeeds.length) {
      return res.json({ ok: true, news: currentNews, feeds, added: 0, warnings: ['Nenhum feed ativo para sincronizar.'] });
    }

    const existingKeys = new Set(
      currentNews.map((newsItem) => `${(newsItem.titulo || '').trim().toLowerCase()}|${newsItem.fonte || ''}`)
    );

    const warnings = [];
    const imported = [];
    const feedUpdates = new Map();

    await Promise.all(
      activeFeeds.map(async (feed) => {
        const result = await fetchFeedItems(feed);
        if (!result.ok) {
          warnings.push(`Falha no feed "${feed.nome}": ${result.error}`);
          return;
        }
        feedUpdates.set(feed.id, new Date().toISOString().split('T')[0]);
        result.items.forEach((item) => {
          const dedupeKey = `${item.title.trim().toLowerCase()}|${item.source}`;
          if (existingKeys.has(dedupeKey)) return;
          existingKeys.add(dedupeKey);
          imported.push({
            id: Date.now() + Math.floor(Math.random() * 100000),
            titulo: item.title,
            resumo: item.description.slice(0, 220),
            conteudo: `<p>${item.description || item.title}</p>${item.link ? `<p><a href="${item.link}" target="_blank" rel="noreferrer">Fonte original</a></p>` : ''}`,
            data: item.date,
            categoria: item.category,
            unidade: '',
            destaque: false,
            visivel: true,
            fonte: item.source,
            autor: 'Feed RSS'
          });
        });
      })
    );

    imported.sort((a, b) => (a.data < b.data ? 1 : -1));
    const mergedNews = imported.concat(currentNews).slice(0, 500);
    const mergedFeeds = feeds.map((feed) =>
      feedUpdates.has(feed.id) ? { ...feed, sync: feedUpdates.get(feed.id) } : feed
    );

    return res.json({
      ok: true,
      news: mergedNews,
      feeds: mergedFeeds,
      added: imported.length,
      warnings
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
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
