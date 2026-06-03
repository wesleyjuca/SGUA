'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const cron = require('node-cron');
let nodemailer; try { nodemailer = require('nodemailer'); } catch(e) { nodemailer = null; }
let Anthropic; try { Anthropic = require('@anthropic-ai/sdk'); } catch(e) { Anthropic = null; }
let bcrypt; try { bcrypt = require('bcryptjs'); } catch(e) { bcrypt = null; }
let jwt; try { jwt = require('jsonwebtoken'); } catch(e) { jwt = null; }
let createSupabaseClient; try { createSupabaseClient = require('@supabase/supabase-js').createClient; } catch(e) { createSupabaseClient = null; }
let PDFDocument; try { PDFDocument = require('pdfkit'); } catch(e) { PDFDocument = null; }
// Agent com rejectUnauthorized:false apenas para fetch de feeds externos (gov BR com certs auto-assinados)
const { Agent: UndiciAgent } = require('undici');
const feedAgent = new UndiciAgent({ connect: { rejectUnauthorized: false } });
const pino = require('pino');
const pinoHttp = require('pino-http');
const { Pool } = require('pg');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } }
    : undefined
});

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
const DOCS_DIR = path.join(PUBLIC_DIR, 'uploads', 'docs');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });

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

const uploadDoc = multer({
  storage: multer.diskStorage({
    destination: DOCS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.pdf';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|vnd\.oasis\.opendocument\.(text|spreadsheet))|text\/(plain|csv))$/;
    cb(null, allowed.test(file.mimetype));
  }
});

if (!process.env.DATABASE_URL) {
  logger.error('Erro: DATABASE_URL é obrigatória no ambiente.');
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
  logger.error('[Pool] Erro inesperado em cliente inativo:', err.message);
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
  logger.error('[DB]', err.message);
  return res.status(500).json({ ok: false, error: 'Erro interno no servidor.' });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// ─── Audit log helper ─────────────────────────────────────────────────────────

async function auditLog(req, acao, entidade, entidadeId, detalhes = {}) {
  const admin = req.admin || {};
  pool.query(
    `INSERT INTO sgua_audit_log (usuario_id, usuario_email, acao, entidade, entidade_id, detalhes, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [admin.id || null, admin.email || null, acao, entidade, entidadeId || null,
     JSON.stringify(detalhes), req.ip || null]
  ).catch(e => logger.warn({ err: e }, '[Audit] log falhou'));
}

// ─── E-mail de alerta automático ─────────────────────────────────────────────

async function sendAlertEmail(assunto, corpo) {
  const t = createTransporter ? createTransporter() : null;
  if (!t) return;
  const to = process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL;
  if (!to) return;
  t.sendMail({
    from: process.env.SMTP_FROM || 'noreply@sema.ac.gov.br',
    to,
    subject: '[SGUA] ' + assunto,
    text: corpo
  }).catch(e => logger.warn({ err: e }, '[Alert Email] falhou'));
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
  const category = (rawCategory || '').toLowerCase().trim();
  if (!category || category.includes('geral')) return 'Geral';
  if (category.includes('fiscal')) return 'Fiscalização';
  if (category.includes('legis')) return 'Legislação';
  if (category.includes('parceria')) return 'Parceria';
  if (category.includes('programa') || category.includes('rem')) return 'Programa REM';
  if (category.includes('evento')) return 'Evento';
  if (category.includes('capac')) return 'Capacitação';
  if (category.includes('gest')) return 'Gestão';
  if (category.includes('monitor') || category.includes('ambient')) return 'Monitoramento';
  return 'Geral';
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
  const timeout = setTimeout(() => ctrl.abort(), 5000);
  try {
    const response = await fetch(feed.url, {
      headers: { 'User-Agent': 'SGUA-RSS-Sync/1.0 (+https://sema.ac.gov.br)' },
      signal: ctrl.signal,
      dispatcher: feedAgent
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
      const rawLink = extractTag(block, 'link') ||
        (block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || '';
      items.push({
        title,
        description: extractTag(block, 'description'),
        link: isSafeUrl(rawLink) ? rawLink : '',
        date: normalizeDate(extractTag(block, 'pubDate')),
        category: normalizeCategory(extractTag(block, 'category') || feed.categoria),
        source: feed.nome,
        source_name: feed.nome,
        categoria: feed.categoria || 'Geral'
      });
      if (items.length >= 20) break;
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
          categoria: feed.categoria || 'Geral'
        });
        if (items.length >= 20) break;
      }
    }

    return { ok: true, items };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

function itemPassaFiltro(item, palavrasChave) {
  if (!palavrasChave || !palavrasChave.trim()) return true;
  const haystack = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
  return palavrasChave.split(',').map(function(p){return p.trim().toLowerCase();}).filter(Boolean).some(function(p){return haystack.includes(p);});
}

async function discoverRssUrl(url) {
  try {
    const ctrl = new AbortController();
    const tmr = setTimeout(() => ctrl.abort(), 3000);
    const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'SGUA-RSS-Discover/1.0' }, dispatcher: feedAgent });
    clearTimeout(tmr);
    const html = await resp.text();
    const linkRx = /<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/gi;
    const m = linkRx.exec(html);
    if (m) {
      const found = m[2];
      try { return found.startsWith('http') ? found : new URL(found, url).href; } catch { return null; }
    }
    return null;
  } catch { return null; }
}

async function fetchPageArticles(feed) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 7000);
  try {
    const response = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SGUA-News-Scraper/2.0; +https://sema.ac.gov.br)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: ctrl.signal,
      dispatcher: feedAgent
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };

    // Suporte JSON Feed (application/feed+json ou application/json)
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('json')) {
      try {
        const jf = await response.json();
        if (jf && Array.isArray(jf.items)) {
          const items = jf.items.slice(0, 20).map(function(it) {
            return {
              title: String(it.title || it.id || '').slice(0, 180),
              description: String(it.summary || it.content_text || it.content_html || '').replace(/<[^>]*>/g,' ').slice(0, 500),
              link: isSafeUrl(it.url||it.id) ? (it.url||it.id) : '',
              date: normalizeDate(it.date_published || it.date_modified),
              category: normalizeCategory(feed.categoria),
              source: feed.nome,
              source_name: jf.title || feed.nome,
              categoria: feed.categoria || 'Geral'
            };
          }).filter(function(it){ return it.title && it.title.length > 4; });
          if (items.length > 0) return { ok: true, items };
        }
      } catch(_) {}
    }

    const html = await response.text();
    const items = [];
    const seenLinks = new Set();
    const seenTitles = new Set();
    const base = (function() { try { return new URL(feed.url).origin; } catch { return ''; } })();

    function mkLink(raw) {
      if (!raw) return '';
      try {
        const abs = raw.startsWith('http') ? raw : new URL(raw, feed.url).href;
        return isSafeUrl(abs) ? abs : '';
      } catch { return ''; }
    }
    function pushItem(title, desc, link, date) {
      const t = title.slice(0, 180);
      const l = link || feed.url;
      if (!t || t.length < 5) return;
      if (seenTitles.has(t)) return;
      if (l && seenLinks.has(l)) return;
      seenTitles.add(t);
      if (l) seenLinks.add(l);
      items.push({
        title: t,
        description: (desc || '').slice(0, 500),
        link: isSafeUrl(l) ? l : '',
        date: date || today(),
        category: normalizeCategory(feed.categoria),
        source: feed.nome,
        source_name: feed.nome,
        categoria: feed.categoria || 'Geral'
      });
    }

    // 1. Schema.org JSON-LD (NewsArticle / ItemList)
    const ldRx = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let lm;
    while ((lm = ldRx.exec(html)) !== null && items.length < 20) {
      try {
        const ld = JSON.parse(lm[1]);
        const entries = Array.isArray(ld) ? ld : (ld['@graph'] || [ld]);
        for (const e of entries) {
          if (!e) continue;
          const type = e['@type'] || '';
          if (type === 'NewsArticle' || type === 'Article' || type === 'BlogPosting') {
            pushItem(e.headline || e.name || '', e.description || '', mkLink(e.url || e.mainEntityOfPage), normalizeDate(e.datePublished));
          }
          if (type === 'ItemList' && Array.isArray(e.itemListElement)) {
            for (const el of e.itemListElement) {
              const item = el.item || el;
              pushItem(item.name || item.headline || '', item.description || '', mkLink(item.url || ''), normalizeDate(item.datePublished));
            }
          }
        }
      } catch(_) {}
    }

    // 2. <article> blocks
    const articleRx = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
    let am;
    while ((am = articleRx.exec(html)) !== null && items.length < 20) {
      const block = am[1];
      const titleM = block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
      const pM = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const linkM = block.match(/<a[^>]+href=["']([^"'#][^"']*?)["'][^>]*>/i);
      const title = decodeXmlEntities(titleM ? titleM[1] : '');
      if (!title || title.length < 5) continue;
      pushItem(title, decodeXmlEntities(pM ? pM[1] : ''), mkLink(linkM ? linkM[1] : ''), '');
    }

    // 3. Padrões de card/lista de notícias por classe CSS
    const cardRx = /<(?:div|li|section)[^>]+class=["'][^"']*(?:noticia|noticias|news[-_]item|card[-_]news|post[-_]item|article[-_]item|item[-_]lista)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|li|section)>/gi;
    let cm;
    while ((cm = cardRx.exec(html)) !== null && items.length < 20) {
      const block = cm[1];
      const titleM = block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i) ||
                     block.match(/<(?:span|div)[^>]+class=["'][^"']*tit[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i);
      const pM = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const linkM = block.match(/<a[^>]+href=["']([^"'#][^"']*?)["'][^>]*>/i);
      const title = decodeXmlEntities(titleM ? titleM[1] : '');
      if (!title || title.length < 5) continue;
      pushItem(title, decodeXmlEntities(pM ? pM[1] : ''), mkLink(linkM ? linkM[1] : ''), '');
    }

    // 4. <h2>/<h3> com link imediato + <p> seguinte (fallback geral)
    if (items.length < 4) {
      const headRx = /<h[23][^>]*>[\s\S]*?<a[^>]+href=["']([^"'#][^"']*?)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h[23]>(?:[\s\S]{0,300}?<p[^>]*>([\s\S]*?)<\/p>)?/gi;
      let hm;
      while ((hm = headRx.exec(html)) !== null && items.length < 15) {
        const title = decodeXmlEntities(hm[2]).slice(0, 180);
        if (!title || title.length < 8) continue;
        pushItem(title, decodeXmlEntities(hm[3] || ''), mkLink(hm[1]), '');
      }
    }

    // 5. OG meta tags como artigo de destaque único (último recurso)
    const ogTitle = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) || [])[1] || '';
    const ogDesc = (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) || [])[1] || '';
    const ogUrl = (html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i) ||
                   html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i) || [])[1] || '';
    if (items.length < 3 && ogTitle && ogTitle.length > 10) {
      pushItem(ogTitle, ogDesc, isSafeUrl(ogUrl) ? ogUrl : feed.url, '');
    }

    if (items.length === 0) return { ok: false, error: 'Nenhum artigo encontrado na página' };
    return { ok: true, items };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSmartItems(feed) {
  // 1. Try RSS/Atom
  const rss = await fetchFeedItems(feed);
  if (rss.ok && rss.items.length > 0) {
    const result = Object.assign({}, rss, { metodo: 'rss' });
    logger.info({ url: feed.url, metodo: 'rss', itens: rss.items.length }, '[fetchSmartItems]');
    return result;
  }

  // 2. Try to discover RSS URL from the page HTML
  const rssUrl = await discoverRssUrl(feed.url);
  if (rssUrl && rssUrl !== feed.url) {
    const r2 = await fetchFeedItems(Object.assign({}, feed, { url: rssUrl }));
    if (r2.ok && r2.items.length > 0) {
      logger.info({ url: feed.url, rss_url: rssUrl, metodo: 'rss_discovered', itens: r2.items.length }, '[fetchSmartItems]');
      return Object.assign({}, r2, { metodo: 'rss_discovered', rss_url: rssUrl });
    }
  }

  // 3. Fallback: HTML scraping
  const scraped = await fetchPageArticles(feed);
  logger.info({ url: feed.url, metodo: 'html', itens: scraped.items?.length ?? 0, ok: scraped.ok }, '[fetchSmartItems]');
  return Object.assign({}, scraped, { metodo: 'html' });
}

// ─── Síntese IA via Claude ────────────────────────────────────────────────────

async function synthesizeArticle(titulo, conteudo, categoria, promptExtra) {
  if (!Anthropic || !process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const sysPrompt = `Você é editor de conteúdo ambiental da SEMA/AC (Secretaria do Meio Ambiente do Acre, Brasil).
Reescreva o artigo de forma clara, objetiva e informativa para o portal da secretaria.
Mantenha todos os fatos, datas e nomes originais. Corrija possíveis erros gramaticais.
Categoria: ${categoria}.${promptExtra ? ' ' + promptExtra : ''}
Responda APENAS com JSON válido no formato: {"titulo":"...","resumo":"...","conteudo":"..."}`;
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: sysPrompt,
      messages: [{ role: 'user', content: `Artigo original:\nTítulo: ${titulo}\n\n${(conteudo || titulo).slice(0, 3000)}` }]
    });
    const text = msg.content[0].text.trim();
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return null;
    return JSON.parse(jsonStr);
  } catch(e) {
    logger.error('[IA] synthesizeArticle falhou:', e.message);
    return null;
  }
}

// ─── Helper: inserir artigo com cota diária e síntese IA ─────────────────────

async function inserirArtigo(item, feed) {
  return withTransaction(async (client) => {
    // SELECT FOR UPDATE evita race condition na cota diária
    const { rows } = await client.query(
      'SELECT noticias_hoje, quantidade_diaria, ultima_reset, usar_ia, prompt_ia FROM sgua_feeds WHERE id=$1 FOR UPDATE',
      [feed.id]
    );
    const fdRow = rows[0];
    if (!fdRow) return 0;
    // Reset de cota diária é responsabilidade exclusiva do cron (0 0 * * *)
    // Se ultima_reset for nulo (linha nova), trata como cota zerada para não bloquear
    const cotaAtual = fdRow.ultima_reset ? (fdRow.noticias_hoje || 0) : 0;
    const qtdMax = fdRow.quantidade_diaria || 10;
    if (cotaAtual >= qtdMax) return 0;

    let title = item.title.slice(0, 180);
    let content = (item.description || item.title).slice(0, 4000);
    let resumo = item.resumo || '';

    // Síntese IA fora da transação (chamada de rede — não bloqueia lock)
    if (fdRow.usar_ia && item._metodo === 'html' && Anthropic && process.env.ANTHROPIC_API_KEY) {
      // Commit parcial para liberar lock durante síntese IA
      const synth = await synthesizeArticle(title, content, feed.categoria || 'Geral', fdRow.prompt_ia || '');
      if (synth) {
        if (synth.titulo) title = String(synth.titulo).slice(0, 180);
        if (synth.conteudo) content = String(synth.conteudo).slice(0, 4000);
        if (synth.resumo) resumo = String(synth.resumo).slice(0, 500);
      }
    }

    const { rowCount } = await client.query(
      'INSERT INTO news (title,content,source,link,category,is_rss,resumo) VALUES ($1,$2,$3,$4,$5,true,$6) ON CONFLICT (title,source) DO NOTHING',
      [title, content, item.source || feed.nome, item.link || null, item.category || 'Geral', resumo]
    );
    if (rowCount > 0) {
      await client.query('UPDATE sgua_feeds SET noticias_hoje=noticias_hoje+1 WHERE id=$1', [feed.id]);
    }
    return rowCount;
  }).catch(e => { logger.error({ err: e }, '[inserirArtigo] erro na transação'); return 0; });
}

// ─── Middleware ───────────────────────────────────────────────────────────────

// ─── JWT Secret ───────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const crypto = require('crypto');
  const s = crypto.randomBytes(48).toString('hex');
  logger.warn('[Auth] JWT_SECRET não configurado — usando segredo volátil. Tokens serão invalidados no próximo restart.');
  return s;
})();
const JWT_EXPIRES = process.env.JWT_EXPIRES || '12h';

// ─── Supabase Storage (optional) ──────────────────────────────────────────────
let supabaseStorage = null;
if (createSupabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const sb = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  supabaseStorage = sb.storage;
  logger.info('[Storage] Supabase Storage habilitado.');
}

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

// CORS para GitHub Pages (frontend estático em wesleyjuca.github.io)
// Origens permitidas configuráveis via ALLOWED_ORIGINS (lista separada por vírgula); fallback para o padrão.
const DEFAULT_ORIGINS = ['https://wesleyjuca.github.io', 'http://localhost:3000'];
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : DEFAULT_ORIGINS);
app.use((req, res, next) => {
  const allowed = ALLOWED_ORIGINS;
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(PUBLIC_DIR));

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!jwt) return next(); // JWT not installed — skip auth (development only)
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' });
  }
}

// ─── Utility routes ───────────────────────────────────────────────────────────

// Healthcheck leve — Railway/Render precisam de 200 para considerar o deploy bem-sucedido
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/ai/status', (_req, res) => {
  res.json({ ok: true, disponivel: !!(Anthropic && process.env.ANTHROPIC_API_KEY) });
});

// Status detalhado do banco (não bloqueia o deploy)
app.get('/api/health/db', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'postgresql', now: new Date().toISOString() });
  } catch (err) {
    logger.error('[Health/DB]', err.message);
    res.status(503).json({ ok: false, error: 'Serviço de banco de dados indisponível.', detail: err.message });
  }
});

// Diagnóstico de conexão — mostra host/usuário sem expor a senha
// ─── Auth endpoints ───────────────────────────────────────────────────────────

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { ok: false, error: 'Muitas tentativas de login.' } });

app.post('/api/auth/login', authLimiter, asyncRoute(async (req, res) => {
  if (!jwt || !bcrypt) return res.status(503).json({ ok: false, error: 'Módulos de autenticação indisponíveis.' });
  const email = sanitizeText((req.body || {}).email || '', 200).toLowerCase();
  const senha = String((req.body || {}).senha || '').slice(0, 128);
  if (!email || !senha) return res.status(400).json({ ok: false, error: 'E-mail e senha são obrigatórios.' });
  const user = await queryOne('SELECT * FROM sgua_admin_users WHERE email=$1 AND ativo=true', [email]);
  if (!user) return res.status(401).json({ ok: false, error: 'Credenciais inválidas.' });
  const valid = await bcrypt.compare(senha, user.password_hash);
  if (!valid) return res.status(401).json({ ok: false, error: 'Credenciais inválidas.' });
  const payload = {
    id: user.id, email: user.email, nome: user.nome,
    perfil: user.perfil, permissoes: user.permissoes || {}
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  auditLog(req, 'login', 'auth', user.id, { email });
  res.json({ ok: true, token, user: Object.assign({}, payload, { ativo: true }) });
}));

app.get('/api/auth/me', requireAuth, asyncRoute(async (req, res) => {
  const user = await queryOne('SELECT id,email,nome,perfil,permissoes,ativo FROM sgua_admin_users WHERE id=$1', [req.admin.id]);
  if (!user) return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
  res.json({ ok: true, user });
}));

app.post('/api/auth/users', requireAuth, asyncRoute(async (req, res) => {
  if (!bcrypt) return res.status(503).json({ ok: false, error: 'bcryptjs indisponível.' });
  if (req.admin.perfil !== 'admin') return res.status(403).json({ ok: false, error: 'Acesso negado.' });
  const body = req.body || {};
  const email = sanitizeText(body.email || '', 200).toLowerCase();
  const nome = sanitizeText(body.nome || '', 200);
  const senha = String(body.senha || '').slice(0, 128);
  const perfil = ['admin','gestor','viewer','gestor_unidade'].includes(body.perfil) ? body.perfil : 'gestor';
  if (!email || !senha || !nome) return res.status(400).json({ ok: false, error: 'email, nome e senha são obrigatórios.' });
  if (!validateEmail(email)) return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
  if (senha.length < 6) return res.status(400).json({ ok: false, error: 'Senha deve ter no mínimo 6 caracteres.' });
  const hash = await bcrypt.hash(senha, 12);
  try {
    const row = await queryOne(
      'INSERT INTO sgua_admin_users (email,nome,password_hash,perfil,permissoes) VALUES ($1,$2,$3,$4,$5) RETURNING id,email,nome,perfil',
      [email, nome, hash, perfil, JSON.stringify(body.permissoes || {})]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ ok: false, error: 'E-mail já cadastrado.' });
    throw e;
  }
}));

app.put('/api/auth/users/:id', requireAuth, asyncRoute(async (req, res) => {
  if (!bcrypt) return res.status(503).json({ ok: false, error: 'bcryptjs indisponível.' });
  if (req.admin.perfil !== 'admin') return res.status(403).json({ ok: false, error: 'Acesso negado.' });
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const body = req.body || {};
  const updates = [];
  const params = [];
  if (body.nome) { updates.push(`nome=$${params.length+1}`); params.push(sanitizeText(body.nome, 200)); }
  if (body.perfil && ['admin','gestor','viewer','gestor_unidade'].includes(body.perfil)) {
    updates.push(`perfil=$${params.length+1}`); params.push(body.perfil);
  }
  if (typeof body.ativo === 'boolean') { updates.push(`ativo=$${params.length+1}`); params.push(body.ativo); }
  if (body.permissoes) { updates.push(`permissoes=$${params.length+1}`); params.push(JSON.stringify(body.permissoes)); }
  if (body.senha) {
    if (body.senha.length < 6) return res.status(400).json({ ok: false, error: 'Senha mínima 6 caracteres.' });
    const hash = await bcrypt.hash(String(body.senha).slice(0, 128), 12);
    updates.push(`password_hash=$${params.length+1}`); params.push(hash);
  }
  if (!updates.length) return res.status(400).json({ ok: false, error: 'Nenhum campo para atualizar.' });
  params.push(id);
  await query(`UPDATE sgua_admin_users SET ${updates.join(',')} WHERE id=$${params.length}`, params);
  res.json({ ok: true });
}));

app.get('/api/auth/users', requireAuth, asyncRoute(async (req, res) => {
  if (req.admin.perfil !== 'admin') return res.status(403).json({ ok: false, error: 'Acesso negado.' });
  const rows = await query('SELECT id,email,nome,perfil,permissoes,ativo,created_at FROM sgua_admin_users ORDER BY id');
  res.json({ ok: true, data: rows });
}));

// ─── Debug (protected) ───────────────────────────────────────────────────────
app.get('/api/debug/db', requireAuth, (req, res) => {
  auditLog(req, 'debug_db', 'system', null, {});
  try {
    const url = new URL(process.env.DATABASE_URL || '');
    res.json({
      host: url.hostname,
      port: url.port,
      user: url.username,
      database: url.pathname.replace('/', '')
    });
  } catch {
    res.status(500).json({ error: 'DATABASE_URL inválida ou ausente' });
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

app.post('/api/users', requireAuth, asyncRoute(async (req, res) => {
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

app.put('/api/users/:id', requireAuth, asyncRoute(async (req, res) => {
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

app.delete('/api/users/:id', requireAuth, asyncRoute(async (req, res) => {
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

app.post('/api/units', requireAuth, asyncRoute(async (req, res) => {
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
  auditLog(req, 'criar_unidade', 'units', data.id, { nome: data.name });
  res.status(201).json({ ok: true, data });
}));

app.put('/api/units/:id', requireAuth, asyncRoute(async (req, res) => {
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

app.delete('/api/units/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const photos = await query('SELECT filename FROM unit_photos WHERE unit_id = $1', [id]);
  photos.forEach((p) => {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, p.filename)); } catch {}
  });
  await query('DELETE FROM units WHERE id = $1', [id]);
  auditLog(req, 'deletar_unidade', 'units', id, {});
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

app.post('/api/units/:id/occupancy', requireAuth, asyncRoute(async (req, res) => {
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

app.put('/api/occupancy/:id/checkout', requireAuth, asyncRoute(async (req, res) => {
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

app.get('/api/news', asyncRoute(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 200);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const [rows, countRow] = await Promise.all([
    query(`SELECT n.*, u.name AS author_name FROM news n LEFT JOIN users u ON u.id = n.author_id ORDER BY n.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    queryOne(`SELECT COUNT(*) AS total FROM news`)
  ]);
  const data = rows.map(function(n) {
    return {
      id: n.id,
      titulo: n.title,
      resumo: n.resumo || (n.content||'').replace(/<[^>]+>/g,'').slice(0,120),
      conteudo: n.content || '',
      data: n.data_pub ? String(n.data_pub).slice(0,10) : String(n.created_at||'').slice(0,10),
      categoria: n.category || 'Geral',
      unidade: n.unidade || '',
      destaque: !!n.destaque,
      visivel: n.visivel !== false,
      fonte: n.fonte || n.source || '',
      autor: n.autor_nome || n.author_name || '',
      link: n.link || '',
      is_rss: !!n.is_rss,
    };
  });
  res.json({ ok: true, data, total: Number(countRow?.total || 0), limit, offset });
}));

app.post('/api/news', requireAuth, asyncRoute(async (req, res) => {
  const b = req.body || {};
  const title = sanitizeText(b.titulo || b.title, 180);
  const content = sanitizeText(b.conteudo || b.content, 4000);
  if (!title) return res.status(400).json({ ok: false, error: 'Título obrigatório.' });
  const row = await queryOne(
    `INSERT INTO news (title, content, source, link, category, is_rss,
       visivel, destaque, resumo, unidade, autor_nome, fonte, data_pub)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [title, content,
     sanitizeText(b.fonte||b.source||'',200), b.link||null,
     sanitizeText(b.categoria||b.category||'Geral',100),
     !!b.is_rss, b.visivel!==false, !!b.destaque,
     sanitizeText(b.resumo||'',500), sanitizeText(b.unidade||'',200),
     sanitizeText(b.autor||b.autor_nome||'',200), sanitizeText(b.fonte||b.source||'',200),
     b.data||null]
  );
  auditLog(req, 'criar_noticia', 'news', row.id, { titulo: row.title });
  res.status(201).json({ ok: true, data: row });
}));

app.put('/api/news/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });

  const existing = await queryOne('SELECT * FROM news WHERE id = $1', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Notícia não encontrada.' });

  const b = req.body || {};
  const title = sanitizeText(b.titulo ?? b.title ?? existing.title, 180);
  const content = sanitizeText(b.conteudo ?? b.content ?? existing.content, 4000);
  const visivel = b.visivel !== undefined ? !!b.visivel : (existing.visivel !== false);
  const destaque = b.destaque !== undefined ? !!b.destaque : !!existing.destaque;

  const data = await queryOne(
    `UPDATE news SET
       title=$1, content=$2,
       source=COALESCE($3,source), link=COALESCE($4,link),
       category=COALESCE($5,category),
       visivel=$6, destaque=$7,
       resumo=COALESCE($8,resumo), unidade=COALESCE($9,unidade),
       autor_nome=COALESCE($10,autor_nome), fonte=COALESCE($11,fonte),
       data_pub=COALESCE($12,data_pub)
     WHERE id=$13 RETURNING *`,
    [title, content,
     b.fonte||b.source||null, b.link||null,
     sanitizeText(b.categoria||b.category||'',100)||null,
     visivel, destaque,
     sanitizeText(b.resumo||'',500)||null, sanitizeText(b.unidade||'',200)||null,
     sanitizeText(b.autor||b.autor_nome||'',200)||null, sanitizeText(b.fonte||b.source||'',200)||null,
     b.data||null, id]
  );
  res.json({ ok: true, data });
}));

app.delete('/api/news/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  await query('DELETE FROM news WHERE id = $1', [id]);
  auditLog(req, 'deletar_noticia', 'news', id, {});
  res.json({ ok: true });
}));

// ─── Requests CRUD ────────────────────────────────────────────────────────────

app.get('/api/requests', asyncRoute(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const [data, countRow] = await Promise.all([
    query(`SELECT r.*, un.name AS unit_name FROM requests r LEFT JOIN units un ON un.id = r.unit_id ORDER BY r.id DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    queryOne(`SELECT COUNT(*) AS total FROM requests`)
  ]);
  res.json({ ok: true, data, total: Number(countRow?.total || 0), limit, offset });
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

app.put('/api/requests/:id', requireAuth, asyncRoute(async (req, res) => {
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
  auditLog(req, 'atualizar_solicitacao', 'requests', id, { status });
  res.json({ ok: true, data });
}));

app.delete('/api/requests/:id', requireAuth, asyncRoute(async (req, res) => {
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
    query('SELECT r.*, u.name AS unit_name FROM requests r LEFT JOIN units u ON u.id = r.unit_id ORDER BY r.created_at DESC'),
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

app.put('/api/state', requireAuth, asyncRoute(async (req, res) => {
  const state = req.body;
  if (!state || typeof state !== 'object') return res.status(400).json({ ok: false, error: 'Payload inválido.' });
  await query(
    "INSERT INTO app_state (key, value, updated_at) VALUES ('sgua', $1, now()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()",
    [JSON.stringify(state)]
  );
  res.json({ ok: true });
}));

// ─── RSS Feed sync ────────────────────────────────────────────────────────────

app.post('/api/feeds/sync', requireAuth, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const feeds = Array.isArray(body.feeds) ? body.feeds : [];
  const activeFeeds = feeds.filter((f) => f && f.ativo && typeof f.url === 'string' && f.url.trim());

  if (!activeFeeds.length) {
    return res.json({ ok: true, feeds, added: 0, warnings: ['Nenhum feed ativo para sincronizar.'] });
  }

  const warnings = [];
  const feedUpdates = new Map();
  const feedAddedMap = new Map();

  for (const feed of activeFeeds) {
    const result = await fetchSmartItems(feed);
    if (!result.ok) {
      warnings.push(`Falha no feed "${feed.nome}": ${result.error}`);
      continue;
    }
    feedUpdates.set(feed.id, today());
    const filteredItems = result.items.filter(function(item){return itemPassaFiltro(item, feed.palavras_chave||'');});
    let feedAdded = 0;
    for (const item of filteredItems) {
      item._metodo = result.metodo || 'rss';
      const n = await inserirArtigo(item, feed);
      feedAdded += n;
    }
    feedAddedMap.set(feed.id, feedAdded);
  }

  const added = Array.from(feedAddedMap.values()).reduce((a,b)=>a+b,0);

  // Update sgua_feeds status
  await Promise.all(activeFeeds.map(async (f) => {
    if (feedUpdates.has(f.id)) {
      await pool.query('UPDATE sgua_feeds SET status=$1,ultimo_sync=now(),ultimo_erro=$2,falhas_consecutivas=0,total_noticias=total_noticias+$3,updated_at=now() WHERE id=$4',
        ['ativo','',feedAddedMap.get(f.id)||0,f.id]).catch(()=>{});
    } else {
      const hasWarn = warnings.find(w => w.startsWith(`Falha no feed "${f.nome}"`));
      if (hasWarn) {
        await pool.query('UPDATE sgua_feeds SET status=$1,ultimo_erro=$2,falhas_consecutivas=falhas_consecutivas+1,updated_at=now() WHERE id=$3',
          [hasWarn.includes('timeout')?'sem_resposta':'invalido', hasWarn.slice(0,500), f.id]).catch(()=>{});
      }
    }
  }));

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

  auditLog(req, 'sync_feeds', 'feeds', null, { added });
  return res.json({ ok: true, feeds: mergedFeeds, added, warnings });
}));

// ─── Feed CRUD ────────────────────────────────────────────────────────────────

app.get('/api/feeds', asyncRoute(async (req, res) => {
  const feeds = await query('SELECT * FROM sgua_feeds ORDER BY prioridade DESC, nome ASC');
  if (!feeds.length) return res.json({ ok: true, feeds: [] });
  const feedIds = feeds.map(function(f){ return f.id; });
  const logs = await query(
    `SELECT id,feed_id,tipo,ok,mensagem,itens_adicionados,created_at FROM (
      SELECT *, row_number() OVER (PARTITION BY feed_id ORDER BY created_at DESC) AS rn
      FROM sgua_feed_logs WHERE feed_id = ANY($1)
    ) t WHERE rn <= 5`,
    [feedIds]
  );
  const logsByFeed = {};
  for (const l of logs) { (logsByFeed[l.feed_id] = logsByFeed[l.feed_id] || []).push(l); }
  res.json({ ok: true, feeds: feeds.map(function(f){ return Object.assign({}, f, { logs: logsByFeed[f.id] || [] }); }) });
}));

app.post('/api/feeds', requireAuth, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const nome = sanitizeText(body.nome||'', 200);
  const url = (body.url||'').trim();
  const categoria = sanitizeText(body.categoria||'Geral', 100);
  const frequencia = ['diaria','semanal','manual'].includes(body.frequencia) ? body.frequencia : 'diaria';
  const prioridade = parseInt(body.prioridade)||0;
  const palavras_chave = sanitizeText(body.palavras_chave||'', 500);
  const quantidade_diaria = Math.min(100, Math.max(1, parseInt(body.quantidade_diaria) || 10));
  const usar_ia = body.usar_ia === true || body.usar_ia === 'true';
  const prompt_ia = sanitizeText(body.prompt_ia || '', 500);
  if (!nome || !url || !isSafeUrl(url))
    return res.status(400).json({ ok: false, error: 'Nome e URL válida são obrigatórios.' });
  const existing = await queryOne('SELECT id FROM sgua_feeds WHERE url=$1',[url]);
  if (existing) return res.status(409).json({ ok: false, error: 'Já existe um feed com esta URL.' });
  // Validar usando fetchSmartItems (tenta RSS, autodiscover e HTML scraping)
  const feedObj = { url, nome, categoria, ativo: true };
  const validacao = await fetchSmartItems(feedObj);
  const statusInicial = validacao.ok ? 'aguardando' : (validacao.error==='timeout' ? 'sem_resposta' : 'invalido');
  const atvFinal = body.ativo !== false; // Sempre respeita escolha do usuário
  const metodoInicial = validacao.metodo || 'rss';
  const [feed] = await query(
    'INSERT INTO sgua_feeds (nome,url,categoria,ativo,status,prioridade,frequencia,ultimo_erro,palavras_chave,metodo_detec,quantidade_diaria,usar_ia,prompt_ia) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
    [nome, url, categoria, atvFinal, statusInicial, prioridade, frequencia, validacao.ok?'':String(validacao.error||'').slice(0,500), palavras_chave, metodoInicial, quantidade_diaria, usar_ia, prompt_ia]
  );
  await query('INSERT INTO sgua_feed_logs (feed_id,tipo,ok,mensagem) VALUES ($1,$2,$3,$4)',
    [feed.id,'validacao',validacao.ok, validacao.ok?`${validacao.items.length} itens encontrados via ${metodoInicial}`:String(validacao.error||'').slice(0,500)]);
  res.status(201).json({ ok:true, feed, validacao:{ok:validacao.ok, count:validacao.ok?validacao.items.length:0, metodo:metodoInicial, error:validacao.ok?null:validacao.error} });
}));

app.put('/api/feeds/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const existing = await queryOne('SELECT * FROM sgua_feeds WHERE id=$1',[id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Feed não encontrado.' });
  const body = req.body || {};
  const urlMudou = body.url && body.url.trim() !== existing.url;
  if (urlMudou && !isSafeUrl(body.url)) return res.status(400).json({ ok:false, error:'URL inválida.' });
  let validacao = { ok: true, items: [] };
  let newStatus = existing.status;
  let atvFinal = body.ativo !== undefined ? body.ativo : existing.ativo;
  if (urlMudou) {
    validacao = await fetchSmartItems({ url: body.url.trim(), nome: body.nome||existing.nome, categoria: body.categoria||existing.categoria, ativo: true });
    newStatus = !validacao.ok ? (validacao.error==='timeout'?'sem_resposta':'invalido') : 'aguardando';
    atvFinal = body.ativo !== undefined ? body.ativo : existing.ativo;
  }
  const fields = ['updated_at=now()'];
  const vals = [];
  const addField = (col,val) => { vals.push(val); fields.push(`${col}=$${vals.length}`); };
  if (body.nome !== undefined) addField('nome', String(body.nome).slice(0,200));
  if (body.url !== undefined) { addField('url', body.url.trim()); addField('status', newStatus); addField('ultimo_erro', validacao.ok?'':String(validacao.error||'').slice(0,500)); addField('metodo_detec', validacao.metodo||existing.metodo_detec||'rss'); }
  if (body.categoria !== undefined) addField('categoria', String(body.categoria).slice(0,100));
  if (body.ativo !== undefined) addField('ativo', atvFinal);
  if (body.prioridade !== undefined) addField('prioridade', parseInt(body.prioridade)||0);
  if (body.frequencia !== undefined && ['diaria','semanal','manual'].includes(body.frequencia)) addField('frequencia', body.frequencia);
  if (body.palavras_chave !== undefined) addField('palavras_chave', sanitizeText(String(body.palavras_chave||''), 500));
  if (body.quantidade_diaria !== undefined) addField('quantidade_diaria', Math.min(100,Math.max(1,parseInt(body.quantidade_diaria)||10)));
  if (body.usar_ia !== undefined) addField('usar_ia', body.usar_ia===true||body.usar_ia==='true');
  if (body.prompt_ia !== undefined) addField('prompt_ia', sanitizeText(String(body.prompt_ia||''),500));
  vals.push(id);
  const [feed] = await query(`UPDATE sgua_feeds SET ${fields.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  if (urlMudou) await query('INSERT INTO sgua_feed_logs (feed_id,tipo,ok,mensagem) VALUES ($1,$2,$3,$4)',
    [id,'validacao',validacao.ok, validacao.ok?`URL atualizada — ${validacao.items.length} itens`:String(validacao.error||'').slice(0,500)]);
  res.json({ ok:true, feed, validacao: urlMudou?{ok:validacao.ok,count:validacao.ok?validacao.items.length:0,error:validacao.ok?null:validacao.error}:null });
}));

app.delete('/api/feeds/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  await query('DELETE FROM sgua_feed_logs WHERE feed_id=$1',[id]);
  const result = await query('DELETE FROM sgua_feeds WHERE id=$1 RETURNING id',[id]);
  if (!result.length) return res.status(404).json({ ok:false, error:'Feed não encontrado.' });
  res.json({ ok: true });
}));

app.post('/api/feeds/:id/toggle', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const rows = await query('UPDATE sgua_feeds SET ativo=NOT ativo, updated_at=now() WHERE id=$1 RETURNING *',[id]);
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Feed não encontrado.' });
  res.json({ ok: true, feed: rows[0] });
}));

app.post('/api/feeds/:id/sync', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const feed = await queryOne('SELECT * FROM sgua_feeds WHERE id=$1',[id]);
  if (!feed) return res.status(404).json({ ok: false, error: 'Feed não encontrado.' });
  await query('UPDATE sgua_feeds SET status=$1, updated_at=now() WHERE id=$2',['sincronizando',id]);
  const result = await fetchSmartItems(feed);
  if (!result.ok) {
    const errStatus = result.error==='timeout' ? 'sem_resposta' : 'invalido';
    await query('UPDATE sgua_feeds SET status=$1,ultimo_erro=$2,falhas_consecutivas=falhas_consecutivas+1,updated_at=now() WHERE id=$3',
      [errStatus, String(result.error||'').slice(0,500), id]);
    await query('INSERT INTO sgua_feed_logs (feed_id,tipo,ok,mensagem) VALUES ($1,$2,$3,$4)',[id,'sync',false,String(result.error||'').slice(0,500)]);
    const fdCheck = await queryOne('SELECT falhas_consecutivas FROM sgua_feeds WHERE id=$1',[id]);
    if (fdCheck && fdCheck.falhas_consecutivas >= 5) {
      await query('UPDATE sgua_feeds SET ativo=false,status=\'pausado\',updated_at=now() WHERE id=$1',[id]);
      await query('INSERT INTO sgua_feed_logs (feed_id,tipo,ok,mensagem) VALUES ($1,$2,$3,$4)',
        [id,'auto_pause',false,'Feed pausado automaticamente após 5 falhas consecutivas']);
    }
    return res.json({ ok: false, error: result.error });
  }
  const toInsert = result.items.filter(function(item){return itemPassaFiltro(item, feed.palavras_chave);});
  let added = 0;
  for (const item of toInsert) {
    item._metodo = result.metodo || 'rss';
    const n = await inserirArtigo(item, feed);
    added += n;
  }
  await query('UPDATE sgua_feeds SET status=$1,ultimo_sync=now(),ultimo_erro=$2,falhas_consecutivas=0,total_noticias=total_noticias+$3,metodo_detec=$4,updated_at=now() WHERE id=$5',
    ['ativo','',added,result.metodo||'rss',id]);
  await query('INSERT INTO sgua_feed_logs (feed_id,tipo,ok,mensagem,itens_adicionados) VALUES ($1,$2,$3,$4,$5)',
    [id,'sync',true,`Sync: ${added} nova(s)`,added]);
  const feedAtualizado = await queryOne('SELECT * FROM sgua_feeds WHERE id=$1',[id]);
  res.json({ ok:true, added, feed: feedAtualizado });
}));

app.post('/api/feeds/scrape', requireAuth, asyncRoute(async (req, res) => {
  const { url, nome, categoria } = req.body || {};
  if (!url || typeof url !== 'string' || !isSafeUrl(url))
    return res.status(400).json({ ok: false, error: 'URL inválida.' });
  const feed = { url: url.trim(), nome: nome || 'Teste', categoria: categoria || 'Geral', ativo: true };
  let result;
  try {
    result = await fetchSmartItems(feed);
  } catch (e) {
    return res.json({ ok: false, error: e.message || 'Erro ao buscar feed.', metodo: 'erro', items: [] });
  }
  if (!result.ok) return res.json({ ok: false, error: result.error, metodo: result.metodo || 'rss', items: [] });
  res.json({ ok: true, count: result.items.length, metodo: result.metodo || 'rss', rss_url: result.rss_url || null, items: result.items.slice(0, 3) });
}));

app.post('/api/feeds/autodiscover', requireAuth, asyncRoute(async (req, res) => {
  const { url } = req.body || {};
  if (!url || !isSafeUrl(url)) return res.status(400).json({ ok: false, error: 'URL inválida.' });
  let base;
  try { base = new URL(url).origin; } catch { return res.status(400).json({ ok:false, error:'URL malformada.' }); }
  const candidatos = [
    url+'/feed', url+'/rss', url+'/feed.xml', url+'/rss.xml', url+'/atom.xml',
    base+'/feed', base+'/rss', base+'/feed.xml', base+'/rss.xml', url
  ];
  // Tentar descobrir via HTML <link rel="alternate">
  try {
    const ctrl = new AbortController();
    const tmr = setTimeout(()=>ctrl.abort(),3000);
    const resp = await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'SGUA-RSS-Discover/1.0'},dispatcher:feedAgent});
    clearTimeout(tmr);
    const html = await resp.text();
    const linkRx = /<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/gi;
    let m;
    while ((m=linkRx.exec(html))!==null) {
      const disc = m[2].startsWith('http') ? m[2] : base+m[2];
      if (!candidatos.includes(disc)) candidatos.unshift(disc);
    }
  } catch (_) {}
  const encontrados = [];
  for (const c of candidatos) {
    if (encontrados.length >= 3) break;
    if (!isSafeUrl(c)) continue;
    const r = await fetchFeedItems({url:c,nome:'Descoberta',categoria:'Geral',ativo:true});
    if (r.ok && r.items.length > 0) encontrados.push({url:c, count:r.items.length, titulo:r.items[0].title});
  }
  res.json({ ok: true, encontrados });
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

app.post('/api/units/:id/photos', requireAuth, upload.single('photo'), asyncRoute(async (req, res) => {
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

app.post('/api/upload/photo', requireAuth, upload.single('photo'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Nenhuma imagem enviada.' });
  if (supabaseStorage) {
    const { data, error } = await supabaseStorage.from('photos').upload(
      `uploads/${req.file.filename}`, req.file.buffer || fs.readFileSync(req.file.path),
      { contentType: req.file.mimetype, upsert: false }
    );
    if (!error && data) {
      const { data: pub } = supabaseStorage.from('photos').getPublicUrl(`uploads/${req.file.filename}`);
      fs.unlink(req.file.path, () => {});
      return res.json({ ok: true, url: pub.publicUrl });
    }
    logger.warn({ err: error }, '[Storage] Supabase upload falhou — usando disco local');
  }
  res.json({ ok: true, url: '/uploads/photos/' + req.file.filename });
}));

app.post('/api/feeds/test', requireAuth, asyncRoute(async (req, res) => {
  const { url, nome } = req.body || {};
  if (!url || typeof url !== 'string' || !isSafeUrl(url))
    return res.status(400).json({ ok: false, error: 'URL inválida.' });
  const feed = { url: url.trim(), nome: nome || 'Teste', categoria: 'Gestão', ativo: true };
  const result = await fetchSmartItems(feed);
  if (!result.ok) return res.json({ ok: false, error: result.error, metodo: result.metodo||'rss', items: [] });
  res.json({ ok: true, count: result.items.length, metodo: result.metodo||'rss', rss_url: result.rss_url||null, items: result.items.slice(0, 3) });
}));

app.delete('/api/photos/:id', requireAuth, asyncRoute(async (req, res) => {
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

app.put('/api/photos/:id/banner', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const photo = await queryOne('SELECT * FROM unit_photos WHERE id = $1', [id]);
  if (!photo) return res.status(404).json({ ok: false, error: 'Foto não encontrada.' });
  await query('UPDATE unit_photos SET is_banner = false WHERE unit_id = $1', [photo.unit_id]);
  await query('UPDATE unit_photos SET is_banner = true WHERE id = $1', [id]);
  await query('UPDATE units SET banner_url = $1 WHERE id = $2', [photo.url, photo.unit_id]);
  res.json({ ok: true });
}));

// ─── Ocorrências Ambientais ───────────────────────────────────────────────────

const TIPOS_OC = ['incendio','enchente','invasao','fauna','infraestrutura','outro'];
const SEVS_OC  = ['baixa','media','alta','critica'];
const STATS_OC = ['aberta','em_andamento','resolvida'];

app.get('/api/ocorrencias', asyncRoute(async (req, res) => {
  const { status, tipo, unit_id } = req.query;
  let sql = `SELECT o.*, u.name AS unit_name FROM sgua_ocorrencias o
             LEFT JOIN units u ON u.id = o.unit_id WHERE 1=1`;
  const params = [];
  if (status) { params.push(status); sql += ` AND o.status=$${params.length}`; }
  if (tipo)   { params.push(tipo);   sql += ` AND o.tipo=$${params.length}`; }
  if (unit_id) { const uid = parsePositiveId(unit_id); if (uid) { params.push(uid); sql += ` AND o.unit_id=$${params.length}`; } }
  sql += ' ORDER BY o.data_ocorrencia DESC, o.created_at DESC';
  const data = await query(sql, params);
  res.json({ ok: true, data });
}));

app.get('/api/units/:id/ocorrencias', asyncRoute(async (req, res) => {
  const unitId = parsePositiveId(req.params.id);
  if (!unitId) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const data = await query(
    'SELECT * FROM sgua_ocorrencias WHERE unit_id=$1 ORDER BY data_ocorrencia DESC, created_at DESC', [unitId]
  );
  res.json({ ok: true, data });
}));

app.post('/api/ocorrencias', requireAuth, asyncRoute(async (req, res) => {
  const b = req.body || {};
  const unit_id = parsePositiveId(b.unit_id);
  const titulo = sanitizeText(b.titulo || '', 200);
  const tipo = TIPOS_OC.includes(b.tipo) ? b.tipo : 'outro';
  const severidade = SEVS_OC.includes(b.severidade) ? b.severidade : 'media';
  if (!unit_id) return res.status(400).json({ ok: false, error: 'unit_id obrigatório.' });
  if (!titulo)  return res.status(400).json({ ok: false, error: 'Título obrigatório.' });
  const unit = await queryOne('SELECT id FROM units WHERE id=$1', [unit_id]);
  if (!unit) return res.status(404).json({ ok: false, error: 'Unidade não encontrada.' });
  const row = await queryOne(
    `INSERT INTO sgua_ocorrencias
       (unit_id, tipo, severidade, status, titulo, descricao, acao_tomada, responsavel, data_ocorrencia)
     VALUES ($1,$2,$3,'aberta',$4,$5,$6,$7,$8) RETURNING *`,
    [unit_id, tipo, severidade, titulo,
     sanitizeText(b.descricao || '', 2000),
     sanitizeText(b.acao_tomada || '', 1000),
     sanitizeText(b.responsavel || '', 120),
     b.data_ocorrencia || new Date().toISOString().slice(0,10)]
  );
  auditLog(req, 'criar_ocorrencia', 'ocorrencias', row.id, { titulo: row.titulo, unit_id });
  if (row.severidade === 'critica') {
    const un = await queryOne('SELECT name FROM units WHERE id=$1', [unit_id]).catch(()=>null);
    sendAlertEmail(
      'Ocorrência Crítica: ' + row.titulo,
      'Uma ocorrência crítica foi registrada no SGUA.\n\nTítulo: ' + row.titulo + '\nUnidade: ' + (un?.name || unit_id) + '\nTipo: ' + row.tipo + '\nDescrição: ' + (row.descricao || '—') + '\n\nAcesse o sistema para mais detalhes.'
    );
  }
  res.status(201).json({ ok: true, data: row });
}));

app.put('/api/ocorrencias/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const existing = await queryOne('SELECT * FROM sgua_ocorrencias WHERE id=$1', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Ocorrência não encontrada.' });
  const b = req.body || {};
  const status     = STATS_OC.includes(b.status) ? b.status : existing.status;
  const severidade = SEVS_OC.includes(b.severidade) ? b.severidade : existing.severidade;
  const tipo       = TIPOS_OC.includes(b.tipo) ? b.tipo : existing.tipo;
  const titulo        = sanitizeText(b.titulo || existing.titulo, 200);
  const descricao     = sanitizeText(b.descricao ?? existing.descricao, 2000);
  const acao_tomada   = sanitizeText(b.acao_tomada ?? existing.acao_tomada, 1000);
  const responsavel   = sanitizeText(b.responsavel ?? existing.responsavel, 120);
  const data_resolucao = status === 'resolvida' && !existing.data_resolucao
    ? (b.data_resolucao || new Date().toISOString().slice(0,10))
    : (b.data_resolucao ?? existing.data_resolucao);
  const row = await queryOne(
    `UPDATE sgua_ocorrencias SET tipo=$1, severidade=$2, status=$3, titulo=$4, descricao=$5,
       acao_tomada=$6, responsavel=$7, data_resolucao=$8, updated_at=now() WHERE id=$9 RETURNING *`,
    [tipo, severidade, status, titulo, descricao, acao_tomada, responsavel, data_resolucao || null, id]
  );
  auditLog(req, 'atualizar_ocorrencia', 'ocorrencias', id, { status });
  res.json({ ok: true, data: row });
}));

app.delete('/api/ocorrencias/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  await query('DELETE FROM sgua_ocorrencias WHERE id=$1', [id]);
  auditLog(req, 'deletar_ocorrencia', 'ocorrencias', id, {});
  res.json({ ok: true });
}));

// ─── Ordens de Manutenção ─────────────────────────────────────────────────────

const TIPOS_OR   = ['preventiva','corretiva','emergencial','melhoria'];
const PRIORS_OR  = ['baixa','normal','alta','urgente'];
const STATS_OR   = ['pendente','em_andamento','aguardando_material','concluida','cancelada'];

app.get('/api/ordens', asyncRoute(async (req, res) => {
  const { status, prioridade, unit_id } = req.query;
  let sql = `SELECT o.*, u.name AS unit_name FROM sgua_ordens o
             LEFT JOIN units u ON u.id = o.unit_id WHERE 1=1`;
  const params = [];
  if (status)    { params.push(status);    sql += ` AND o.status=$${params.length}`; }
  if (prioridade){ params.push(prioridade);sql += ` AND o.prioridade=$${params.length}`; }
  if (unit_id)   { const uid=parsePositiveId(unit_id); if(uid){ params.push(uid); sql += ` AND o.unit_id=$${params.length}`;} }
  sql += ' ORDER BY CASE o.prioridade WHEN \'urgente\' THEN 0 WHEN \'alta\' THEN 1 WHEN \'normal\' THEN 2 ELSE 3 END, o.created_at DESC';
  const data = await query(sql, params);
  res.json({ ok: true, data });
}));

app.get('/api/units/:id/ordens', asyncRoute(async (req, res) => {
  const unitId = parsePositiveId(req.params.id);
  if (!unitId) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const data = await query(
    'SELECT * FROM sgua_ordens WHERE unit_id=$1 ORDER BY created_at DESC', [unitId]
  );
  res.json({ ok: true, data });
}));

app.post('/api/ordens', requireAuth, asyncRoute(async (req, res) => {
  const b = req.body || {};
  const unit_id = parsePositiveId(b.unit_id);
  const titulo = sanitizeText(b.titulo || '', 200);
  if (!unit_id) return res.status(400).json({ ok: false, error: 'unit_id obrigatório.' });
  if (!titulo)  return res.status(400).json({ ok: false, error: 'Título obrigatório.' });
  const unit = await queryOne('SELECT id FROM units WHERE id=$1', [unit_id]);
  if (!unit) return res.status(404).json({ ok: false, error: 'Unidade não encontrada.' });
  const tipo      = TIPOS_OR.includes(b.tipo) ? b.tipo : 'corretiva';
  const prioridade= PRIORS_OR.includes(b.prioridade) ? b.prioridade : 'normal';
  const custo_est = b.custo_estimado ? Number(b.custo_estimado) || null : null;
  const row = await queryOne(
    `INSERT INTO sgua_ordens
       (unit_id, tipo, prioridade, status, titulo, descricao, responsavel, fornecedor,
        custo_estimado, data_prevista)
     VALUES ($1,$2,$3,'pendente',$4,$5,$6,$7,$8,$9) RETURNING *`,
    [unit_id, tipo, prioridade, titulo,
     sanitizeText(b.descricao || '', 2000),
     sanitizeText(b.responsavel || '', 120),
     sanitizeText(b.fornecedor || '', 120),
     custo_est,
     b.data_prevista || null]
  );
  auditLog(req, 'criar_ordem', 'ordens', row.id, { titulo: row.titulo, unit_id });
  if (row.prioridade === 'urgente') {
    const un = await queryOne('SELECT name FROM units WHERE id=$1', [unit_id]).catch(()=>null);
    sendAlertEmail(
      'Ordem Urgente: ' + row.titulo,
      'Uma ordem de manutenção urgente foi criada no SGUA.\n\nTítulo: ' + row.titulo + '\nUnidade: ' + (un?.name || unit_id) + '\nTipo: ' + row.tipo + '\nDescrição: ' + (row.descricao || '—') + '\n\nAcesse o sistema para mais detalhes.'
    );
  }
  res.status(201).json({ ok: true, data: row });
}));

app.put('/api/ordens/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const existing = await queryOne('SELECT * FROM sgua_ordens WHERE id=$1', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Ordem não encontrada.' });
  const b = req.body || {};
  const status     = STATS_OR.includes(b.status) ? b.status : existing.status;
  const prioridade = PRIORS_OR.includes(b.prioridade) ? b.prioridade : existing.prioridade;
  const tipo       = TIPOS_OR.includes(b.tipo) ? b.tipo : existing.tipo;
  const titulo        = sanitizeText(b.titulo || existing.titulo, 200);
  const descricao     = sanitizeText(b.descricao ?? existing.descricao, 2000);
  const responsavel   = sanitizeText(b.responsavel ?? existing.responsavel, 120);
  const fornecedor    = sanitizeText(b.fornecedor ?? existing.fornecedor, 120);
  const observacoes   = sanitizeText(b.observacoes ?? existing.observacoes, 2000);
  const custo_est     = b.custo_estimado !== undefined ? (Number(b.custo_estimado) || null) : existing.custo_estimado;
  const custo_real    = b.custo_real !== undefined ? (Number(b.custo_real) || null) : existing.custo_real;
  const data_prevista = b.data_prevista !== undefined ? (b.data_prevista || null) : existing.data_prevista;
  const data_conclusao = status === 'concluida' && !existing.data_conclusao
    ? (b.data_conclusao || new Date().toISOString().slice(0,10))
    : (b.data_conclusao !== undefined ? (b.data_conclusao || null) : existing.data_conclusao);
  const row = await queryOne(
    `UPDATE sgua_ordens SET tipo=$1, prioridade=$2, status=$3, titulo=$4, descricao=$5,
       responsavel=$6, fornecedor=$7, custo_estimado=$8, custo_real=$9,
       data_prevista=$10, data_conclusao=$11, observacoes=$12, updated_at=now()
     WHERE id=$13 RETURNING *`,
    [tipo, prioridade, status, titulo, descricao, responsavel, fornecedor,
     custo_est, custo_real, data_prevista, data_conclusao || null, observacoes, id]
  );
  auditLog(req, 'atualizar_ordem', 'ordens', id, { status });
  res.json({ ok: true, data: row });
}));

app.delete('/api/ordens/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  await query('DELETE FROM sgua_ordens WHERE id=$1', [id]);
  auditLog(req, 'deletar_ordem', 'ordens', id, {});
  res.json({ ok: true });
}));

// ─── Audit Log ────────────────────────────────────────────────────────────────

app.get('/api/audit', requireAuth, asyncRoute(async (req, res) => {
  if (req.admin.perfil !== 'admin') return res.status(403).json({ ok: false, error: 'Acesso negado.' });
  const limit  = Math.min(Number(req.query.limit)  || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const entidade = req.query.entidade || null;
  let sql = 'SELECT * FROM sgua_audit_log WHERE 1=1';
  const params = [];
  if (entidade) { params.push(entidade); sql += ` AND entidade=$${params.length}`; }
  params.push(limit); sql  += ` ORDER BY created_at DESC LIMIT $${params.length}`;
  params.push(offset); sql += ` OFFSET $${params.length}`;
  const data = await query(sql, params);
  const { rows: [{ total }] } = await pool.query(
    entidade
      ? 'SELECT COUNT(*) as total FROM sgua_audit_log WHERE entidade=$1'
      : 'SELECT COUNT(*) as total FROM sgua_audit_log',
    entidade ? [entidade] : []
  );
  res.json({ ok: true, data, total: Number(total) });
}));

// ─── Stats consolidados ───────────────────────────────────────────────────────

app.get('/api/stats', asyncRoute(async (_req, res) => {
  const [unitsRow, newsRow, feedsRow, ocorrRow, ordensRow, ocupRow,
         newsCats, feedsStatus, agendaRow] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status='active') AS ativas FROM units`),
    queryOne(`SELECT COUNT(*) AS total FROM news WHERE created_at > now()-interval '30 days'`),
    queryOne(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE ativo) AS ativos FROM sgua_feeds`),
    queryOne(`SELECT COUNT(*) AS total FROM sgua_ocorrencias WHERE status != 'resolvida'`).catch(()=>({total:0})),
    queryOne(`SELECT COUNT(*) AS total FROM sgua_ordens WHERE status NOT IN ('concluida','cancelada')`).catch(()=>({total:0})),
    queryOne(`SELECT COALESCE(SUM(current_occupancy),0) AS total FROM units`),
    query(`SELECT category, COUNT(*) AS total FROM news
           WHERE created_at > now()-interval '30 days'
           GROUP BY category ORDER BY total DESC LIMIT 8`),
    query(`SELECT status, COUNT(*) AS total FROM sgua_feeds GROUP BY status`),
    queryOne(`SELECT COUNT(*) AS proximos FROM sgua_agenda WHERE status='agendado' AND data_inicio BETWEEN now() AND now()+interval '7 days'`).catch(()=>({proximos:0}))
  ]);
  res.json({
    ok: true,
    units: unitsRow, news: newsRow, feeds: feedsRow,
    ocorrencias: ocorrRow, ordens: ordensRow, ocupacao: ocupRow,
    newsPorCategoria: newsCats, feedsStatus, agenda: agendaRow
  });
}));

app.get('/api/stats/ocupacao-historico', asyncRoute(async (_req, res) => {
  const data = await query(`
    SELECT date_trunc('day', o.start_date)::DATE AS dia,
           COUNT(*) AS entradas
    FROM occupancy_records o
    WHERE o.start_date >= now() - interval '30 days'
    GROUP BY dia ORDER BY dia
  `).catch(() => []);
  res.json({ ok: true, data });
}));

// ─── Agenda de Eventos ───────────────────────────────────────────────────────

const TIPOS_AG = ['reuniao','vistoria','fiscalizacao','capacitacao','audiencia','outro'];
const STATS_AG = ['agendado','em_andamento','realizado','cancelado'];

app.get('/api/agenda', asyncRoute(async (req, res) => {
  let sql = `SELECT a.*, u.name AS unit_name FROM sgua_agenda a LEFT JOIN units u ON u.id = a.unit_id WHERE 1=1`;
  const params = [];
  if (req.query.status && STATS_AG.includes(req.query.status)) {
    params.push(req.query.status); sql += ` AND a.status=$${params.length}`;
  }
  if (req.query.tipo && TIPOS_AG.includes(req.query.tipo)) {
    params.push(req.query.tipo); sql += ` AND a.tipo=$${params.length}`;
  }
  if (req.query.unit_id) {
    const uid = parsePositiveId(req.query.unit_id);
    if (uid) { params.push(uid); sql += ` AND a.unit_id=$${params.length}`; }
  }
  if (req.query.mes && req.query.ano) {
    const mes = parseInt(req.query.mes), ano = parseInt(req.query.ano);
    if (mes >= 1 && mes <= 12 && ano > 2000) {
      params.push(ano, mes);
      sql += ` AND EXTRACT(YEAR FROM a.data_inicio)=$${params.length-1} AND EXTRACT(MONTH FROM a.data_inicio)=$${params.length}`;
    }
  }
  sql += ` ORDER BY a.data_inicio ASC`;
  const rows = await query(sql, params);
  res.json({ ok: true, rows });
}));

app.get('/api/agenda/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const row = await queryOne('SELECT a.*, u.name AS unit_name FROM sgua_agenda a LEFT JOIN units u ON u.id = a.unit_id WHERE a.id=$1', [id]);
  if (!row) return res.status(404).json({ ok: false, error: 'Não encontrado.' });
  res.json({ ok: true, data: row });
}));

app.post('/api/agenda', requireAuth, asyncRoute(async (req, res) => {
  const b = req.body;
  const titulo = sanitizeText(b.titulo || '', 200);
  if (!titulo) return res.status(400).json({ ok: false, error: 'Título obrigatório.' });
  if (!b.data_inicio) return res.status(400).json({ ok: false, error: 'data_inicio obrigatório.' });
  const tipo = TIPOS_AG.includes(b.tipo) ? b.tipo : 'reuniao';
  const status = STATS_AG.includes(b.status) ? b.status : 'agendado';
  const unit_id = parsePositiveId(b.unit_id) || null;
  const row = await queryOne(
    `INSERT INTO sgua_agenda (unit_id, tipo, status, titulo, descricao, local, responsavel, data_inicio, data_fim, participantes, resultado, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [unit_id, tipo, status, titulo,
     sanitizeText(b.descricao || '', 2000),
     sanitizeText(b.local || '', 200),
     sanitizeText(b.responsavel || '', 120),
     b.data_inicio, b.data_fim || null,
     sanitizeText(b.participantes || '', 500),
     sanitizeText(b.resultado || '', 2000),
     req.admin?.email || '']
  );
  auditLog(req, 'criar_agenda', 'agenda', row.id, { titulo });
  res.status(201).json({ ok: true, data: row });
}));

app.put('/api/agenda/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const existing = await queryOne('SELECT * FROM sgua_agenda WHERE id=$1', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Não encontrado.' });
  const b = req.body;
  const titulo = sanitizeText(b.titulo || existing.titulo, 200);
  const tipo = TIPOS_AG.includes(b.tipo) ? b.tipo : existing.tipo;
  const status = STATS_AG.includes(b.status) ? b.status : existing.status;
  const unit_id = b.unit_id !== undefined ? (parsePositiveId(b.unit_id) || null) : existing.unit_id;
  const row = await queryOne(
    `UPDATE sgua_agenda SET unit_id=$1, tipo=$2, status=$3, titulo=$4, descricao=$5, local=$6,
     responsavel=$7, data_inicio=$8, data_fim=$9, participantes=$10, resultado=$11, updated_at=now()
     WHERE id=$12 RETURNING *`,
    [unit_id, tipo, status, titulo,
     sanitizeText(b.descricao !== undefined ? b.descricao : existing.descricao, 2000),
     sanitizeText(b.local !== undefined ? b.local : existing.local, 200),
     sanitizeText(b.responsavel !== undefined ? b.responsavel : existing.responsavel, 120),
     b.data_inicio || existing.data_inicio,
     b.data_fim !== undefined ? (b.data_fim || null) : existing.data_fim,
     sanitizeText(b.participantes !== undefined ? b.participantes : existing.participantes, 500),
     sanitizeText(b.resultado !== undefined ? b.resultado : existing.resultado, 2000),
     id]
  );
  auditLog(req, 'atualizar_agenda', 'agenda', id, { status });
  res.json({ ok: true, data: row });
}));

app.delete('/api/agenda/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const existing = await queryOne('SELECT id FROM sgua_agenda WHERE id=$1', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Não encontrado.' });
  await query('DELETE FROM sgua_agenda WHERE id=$1', [id]);
  auditLog(req, 'deletar_agenda', 'agenda', id, {});
  res.json({ ok: true });
}));

// ─── Relatórios PDF ───────────────────────────────────────────────────────────

function pdfHeader(doc, titulo) {
  doc.fontSize(18).font('Helvetica-Bold').text('SEMA/AC — SGUA', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text('Sistema de Gestão CIMA & UGAI', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(14).font('Helvetica-Bold').text(titulo, { align: 'center' });
  doc.fontSize(9).font('Helvetica').text('Gerado em: ' + new Date().toLocaleString('pt-BR'), { align: 'center' });
  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);
}

app.get('/api/relatorios/ocupacao', requireAuth, asyncRoute(async (req, res) => {
  if (!PDFDocument) return res.status(503).json({ ok: false, error: 'pdfkit não disponível.' });
  const mes = parseInt(req.query.mes) || new Date().getMonth() + 1;
  const ano = parseInt(req.query.ano) || new Date().getFullYear();
  const units = await query(`SELECT u.*, COALESCE(SUM(o.vagas),0) AS total_vagas, COALESCE(SUM(o.current_occupancy),0) AS total_ocup FROM units u LEFT JOIN occupancy_records o ON o.unit_id=u.id AND EXTRACT(MONTH FROM o.start_date)=$1 AND EXTRACT(YEAR FROM o.start_date)=$2 GROUP BY u.id ORDER BY u.name`, [mes, ano]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="relatorio-ocupacao-${ano}-${String(mes).padStart(2,'0')}.pdf"`);
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  pdfHeader(doc, `Relatório de Ocupação — ${String(mes).padStart(2,'0')}/${ano}`);
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Unidade', 50, doc.y, { width: 200, continued: true });
  doc.text('Tipo', 250, doc.y, { width: 80, continued: true });
  doc.text('Vagas', 330, doc.y, { width: 70, continued: true });
  doc.text('Ocupação', 400, doc.y, { width: 80, continued: true });
  doc.text('% Uso', 480, doc.y);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(9);
  units.forEach(u => {
    const pct = u.total_vagas > 0 ? Math.round((u.total_ocup / u.total_vagas) * 100) : 0;
    doc.text(u.name || '—', 50, doc.y, { width: 200, continued: true });
    doc.text(u.tipo || '—', 250, doc.y, { width: 80, continued: true });
    doc.text(String(u.total_vagas || 0), 330, doc.y, { width: 70, continued: true });
    doc.text(String(u.total_ocup || 0), 400, doc.y, { width: 80, continued: true });
    doc.text(pct + '%', 480, doc.y);
  });
  doc.end();
  auditLog(req, 'relatorio_ocupacao', 'relatorios', null, { mes, ano });
}));

app.get('/api/relatorios/ocorrencias', requireAuth, asyncRoute(async (req, res) => {
  if (!PDFDocument) return res.status(503).json({ ok: false, error: 'pdfkit não disponível.' });
  const inicio = req.query.inicio || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0,10);
  const fim = req.query.fim || new Date().toISOString().slice(0,10);
  const rows = await query(`SELECT o.*, u.name AS unit_name FROM sgua_ocorrencias o LEFT JOIN units u ON u.id=o.unit_id WHERE o.data_ocorrencia BETWEEN $1 AND $2 ORDER BY o.data_ocorrencia DESC`, [inicio, fim]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="relatorio-ocorrencias-${inicio}-${fim}.pdf"`);
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  pdfHeader(doc, `Relatório de Ocorrências — ${inicio} a ${fim}`);
  doc.fontSize(9).font('Helvetica-Bold');
  ['Data','Unidade','Tipo','Severidade','Status','Título'].forEach((h2, i) => {
    const xs = [50,110,210,280,340,400];
    doc.text(h2, xs[i] || 50, doc.y, { width: 60, continued: i < 5 });
    if (i === 5) doc.text(h2, xs[i], doc.y);
  });
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(8);
  rows.forEach(r => {
    const y = doc.y;
    if (y > 700) { doc.addPage(); }
    doc.text(String(r.data_ocorrencia||'').slice(0,10), 50, doc.y, {width:55,continued:true});
    doc.text((r.unit_name||'').slice(0,15), 110, doc.y, {width:95,continued:true});
    doc.text((r.tipo||'').slice(0,12), 210, doc.y, {width:65,continued:true});
    doc.text((r.severidade||'').slice(0,10), 280, doc.y, {width:55,continued:true});
    doc.text((r.status||'').slice(0,12), 340, doc.y, {width:55,continued:true});
    doc.text((r.titulo||'').slice(0,30), 400, doc.y, {width:145});
  });
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(10).text('Total: ' + rows.length + ' ocorrência(s)');
  doc.end();
  auditLog(req, 'relatorio_ocorrencias', 'relatorios', null, { inicio, fim });
}));

app.get('/api/relatorios/ordens', requireAuth, asyncRoute(async (req, res) => {
  if (!PDFDocument) return res.status(503).json({ ok: false, error: 'pdfkit não disponível.' });
  const inicio = req.query.inicio || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0,10);
  const fim = req.query.fim || new Date().toISOString().slice(0,10);
  const rows = await query(`SELECT o.*, u.name AS unit_name FROM sgua_ordens o LEFT JOIN units u ON u.id=o.unit_id WHERE o.created_at::date BETWEEN $1 AND $2 ORDER BY o.created_at DESC`, [inicio, fim]);
  const totalEst = rows.reduce((s,r)=>s+Number(r.custo_estimado||0),0);
  const totalReal = rows.reduce((s,r)=>s+Number(r.custo_real||0),0);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="relatorio-ordens-${inicio}-${fim}.pdf"`);
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  pdfHeader(doc, `Relatório de Ordens de Manutenção — ${inicio} a ${fim}`);
  doc.fontSize(9).font('Helvetica-Bold');
  ['Unidade','Tipo','Prioridade','Status','Custo Est.','Custo Real'].forEach((h2, i) => {
    const xs = [50,160,240,310,390,470];
    doc.text(h2, xs[i], doc.y, { width: 90, continued: i < 5 });
    if (i === 5) doc.text(h2, xs[i], doc.y);
  });
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(8);
  rows.forEach(r => {
    if (doc.y > 700) { doc.addPage(); }
    doc.text((r.unit_name||'').slice(0,15), 50, doc.y, {width:105,continued:true});
    doc.text((r.tipo||'').slice(0,10), 160, doc.y, {width:75,continued:true});
    doc.text((r.prioridade||'').slice(0,10), 240, doc.y, {width:65,continued:true});
    doc.text((r.status||'').slice(0,12), 310, doc.y, {width:75,continued:true});
    doc.text(r.custo_estimado ? 'R$ '+Number(r.custo_estimado).toFixed(2) : '—', 390, doc.y, {width:75,continued:true});
    doc.text(r.custo_real ? 'R$ '+Number(r.custo_real).toFixed(2) : '—', 470, doc.y, {width:75});
  });
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(10).text(`Total: ${rows.length} ordem(ns) | Custo Est.: R$ ${totalEst.toFixed(2)} | Real: R$ ${totalReal.toFixed(2)}`);
  doc.end();
  auditLog(req, 'relatorio_ordens', 'relatorios', null, { inicio, fim });
}));

// ─── Inventário de Equipamentos ──────────────────────────────────────────────

const TIPOS_EQ = ['gerador','painel_solar','veiculo','embarcacao','ti','medicao','comunicacao','outro'];
const STATS_EQ = ['operacional','manutencao','inativo','descarte'];

app.get('/api/equipamentos', asyncRoute(async (req, res) => {
  let sql = `SELECT e.*, u.name AS unit_name FROM sgua_equipamentos e LEFT JOIN units u ON u.id=e.unit_id WHERE 1=1`;
  const params = [];
  if (req.query.unit_id) { const uid=parsePositiveId(req.query.unit_id); if(uid){params.push(uid);sql+=` AND e.unit_id=$${params.length}`;} }
  if (req.query.status && STATS_EQ.includes(req.query.status)) { params.push(req.query.status);sql+=` AND e.status=$${params.length}`; }
  if (req.query.tipo && TIPOS_EQ.includes(req.query.tipo)) { params.push(req.query.tipo);sql+=` AND e.tipo=$${params.length}`; }
  sql += ` ORDER BY e.unit_id, e.nome`;
  const rows = await query(sql, params);
  res.json({ ok: true, rows });
}));

app.get('/api/units/:id/equipamentos', asyncRoute(async (req, res) => {
  const unitId = parsePositiveId(req.params.id);
  if (!unitId) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const rows = await query('SELECT * FROM sgua_equipamentos WHERE unit_id=$1 ORDER BY nome', [unitId]);
  res.json({ ok: true, rows });
}));

app.post('/api/equipamentos', requireAuth, asyncRoute(async (req, res) => {
  const b = req.body;
  const nome = sanitizeText(b.nome || '', 200);
  if (!nome) return res.status(400).json({ ok: false, error: 'Nome obrigatório.' });
  const unit_id = parsePositiveId(b.unit_id);
  if (!unit_id) return res.status(400).json({ ok: false, error: 'unit_id obrigatório.' });
  const tipo = TIPOS_EQ.includes(b.tipo) ? b.tipo : 'outro';
  const status = STATS_EQ.includes(b.status) ? b.status : 'operacional';
  const row = await queryOne(
    `INSERT INTO sgua_equipamentos (unit_id,nome,tipo,marca,modelo,numero_serie,patrimonio,status,data_aquisicao,valor_aquisicao,responsavel,localizacao,obs,ultima_manutencao,proxima_manutencao)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [unit_id, nome, tipo,
     sanitizeText(b.marca||'',120), sanitizeText(b.modelo||'',120),
     sanitizeText(b.numero_serie||'',120), sanitizeText(b.patrimonio||'',80),
     status, b.data_aquisicao||null,
     b.valor_aquisicao ? Number(b.valor_aquisicao) : null,
     sanitizeText(b.responsavel||'',120), sanitizeText(b.localizacao||'',200),
     sanitizeText(b.obs||'',2000),
     b.ultima_manutencao||null, b.proxima_manutencao||null]
  );
  auditLog(req, 'criar_equipamento', 'equipamentos', row.id, { nome, unit_id });
  res.status(201).json({ ok: true, data: row });
}));

app.put('/api/equipamentos/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const existing = await queryOne('SELECT * FROM sgua_equipamentos WHERE id=$1', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Não encontrado.' });
  const b = req.body;
  const nome = sanitizeText(b.nome||existing.nome, 200);
  const tipo = TIPOS_EQ.includes(b.tipo) ? b.tipo : existing.tipo;
  const status = STATS_EQ.includes(b.status) ? b.status : existing.status;
  const unit_id = b.unit_id !== undefined ? (parsePositiveId(b.unit_id)||existing.unit_id) : existing.unit_id;
  const row = await queryOne(
    `UPDATE sgua_equipamentos SET unit_id=$1,nome=$2,tipo=$3,marca=$4,modelo=$5,numero_serie=$6,patrimonio=$7,status=$8,
     data_aquisicao=$9,valor_aquisicao=$10,responsavel=$11,localizacao=$12,obs=$13,ultima_manutencao=$14,proxima_manutencao=$15,updated_at=now()
     WHERE id=$16 RETURNING *`,
    [unit_id, nome, tipo,
     sanitizeText(b.marca!==undefined?b.marca:existing.marca,120),
     sanitizeText(b.modelo!==undefined?b.modelo:existing.modelo,120),
     sanitizeText(b.numero_serie!==undefined?b.numero_serie:existing.numero_serie,120),
     sanitizeText(b.patrimonio!==undefined?b.patrimonio:existing.patrimonio,80),
     status,
     b.data_aquisicao!==undefined?b.data_aquisicao||null:existing.data_aquisicao,
     b.valor_aquisicao!==undefined?(b.valor_aquisicao?Number(b.valor_aquisicao):null):existing.valor_aquisicao,
     sanitizeText(b.responsavel!==undefined?b.responsavel:existing.responsavel,120),
     sanitizeText(b.localizacao!==undefined?b.localizacao:existing.localizacao,200),
     sanitizeText(b.obs!==undefined?b.obs:existing.obs,2000),
     b.ultima_manutencao!==undefined?b.ultima_manutencao||null:existing.ultima_manutencao,
     b.proxima_manutencao!==undefined?b.proxima_manutencao||null:existing.proxima_manutencao,
     id]
  );
  auditLog(req, 'atualizar_equipamento', 'equipamentos', id, { status });
  res.json({ ok: true, data: row });
}));

app.delete('/api/equipamentos/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const existing = await queryOne('SELECT id FROM sgua_equipamentos WHERE id=$1', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Não encontrado.' });
  await query('DELETE FROM sgua_equipamentos WHERE id=$1', [id]);
  auditLog(req, 'deletar_equipamento', 'equipamentos', id, {});
  res.json({ ok: true });
}));

app.post('/api/equipamentos/:id/criar-ordem', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const eq = await queryOne('SELECT * FROM sgua_equipamentos WHERE id=$1', [id]);
  if (!eq) return res.status(404).json({ ok: false, error: 'Equipamento não encontrado.' });
  const titulo = sanitizeText(req.body.titulo || `Manutenção: ${eq.nome}`, 200);
  const row = await queryOne(
    `INSERT INTO sgua_ordens (unit_id,tipo,prioridade,status,titulo,descricao,responsavel)
     VALUES ($1,'corretiva','normal','pendente',$2,$3,$4) RETURNING *`,
    [eq.unit_id, titulo, `Ordem de serviço gerada a partir do equipamento: ${eq.nome} (${eq.tipo})`, eq.responsavel||'']
  );
  auditLog(req, 'criar_ordem_equipamento', 'ordens', row.id, { equipamento_id: id, titulo });
  res.status(201).json({ ok: true, data: row });
}));

// ─── Gestão de Documentos ─────────────────────────────────────────────────────

const CATS_DOC = ['relatorio','portaria','contrato','licitacao','legislacao','plano','mapa','outro'];

app.get('/api/documentos', asyncRoute(async (req, res) => {
  let sql = `SELECT d.*, u.name AS unit_name FROM sgua_documentos d LEFT JOIN units u ON u.id=d.unit_id WHERE 1=1`;
  const params = [];
  const isAuth = req.headers.authorization;
  if (!isAuth) { sql += ` AND d.publico=true`; }
  if (req.query.publico === 'true') { sql += ` AND d.publico=true`; }
  if (req.query.publico === 'false' && isAuth) { sql += ` AND d.publico=false`; }
  if (req.query.categoria && CATS_DOC.includes(req.query.categoria)) { params.push(req.query.categoria); sql+=` AND d.categoria=$${params.length}`; }
  if (req.query.unit_id) { const uid=parsePositiveId(req.query.unit_id); if(uid){params.push(uid);sql+=` AND d.unit_id=$${params.length}`;} }
  if (req.query.ano) { const ano=parseInt(req.query.ano); if(ano>2000){params.push(ano);sql+=` AND d.ano=$${params.length}`;} }
  sql += ` ORDER BY d.created_at DESC LIMIT 200`;
  const rows = await query(sql, params);
  res.json({ ok: true, rows });
}));

app.post('/api/documentos/upload', requireAuth, uploadDoc.single('arquivo'), asyncRoute(async (req, res) => {
  const b = req.body;
  const titulo = sanitizeText(b.titulo || (req.file ? req.file.originalname : ''), 300);
  if (!titulo) return res.status(400).json({ ok: false, error: 'Título obrigatório.' });
  const categoria = CATS_DOC.includes(b.categoria) ? b.categoria : 'outro';
  const unit_id = parsePositiveId(b.unit_id) || null;
  const publico = b.publico === 'true' || b.publico === true;

  let arquivo_url = '', arquivo_nome = '', arquivo_tipo = '', arquivo_tamanho = 0;
  if (req.file) {
    arquivo_nome = sanitizeText(req.file.originalname, 300);
    arquivo_tipo = req.file.mimetype;
    arquivo_tamanho = req.file.size;
    arquivo_url = '/uploads/docs/' + req.file.filename;
    // Upload para Supabase Storage se disponível
    if (supabaseStorage) {
      try {
        const buf = fs.readFileSync(req.file.path);
        await supabaseStorage.from('documents').upload(`docs/${req.file.filename}`, buf, { contentType: req.file.mimetype, upsert: true });
        const { data: pub } = supabaseStorage.from('documents').getPublicUrl(`docs/${req.file.filename}`);
        if (pub && pub.publicUrl) arquivo_url = pub.publicUrl;
      } catch(e) { logger.warn('[Doc Upload] Supabase Storage falhou, usando disco:', e.message); }
    }
  }

  const row = await queryOne(
    `INSERT INTO sgua_documentos (unit_id,categoria,titulo,descricao,arquivo_url,arquivo_nome,arquivo_tipo,arquivo_tamanho,publico,tags,ano,autor,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [unit_id, categoria, titulo,
     sanitizeText(b.descricao||'',2000), arquivo_url, arquivo_nome, arquivo_tipo, arquivo_tamanho,
     publico, sanitizeText(b.tags||'',300),
     b.ano ? parseInt(b.ano) : new Date().getFullYear(),
     sanitizeText(b.autor||'',120),
     req.admin?.email||'']
  );
  auditLog(req, 'upload_documento', 'documentos', row.id, { titulo, categoria, publico });
  res.status(201).json({ ok: true, data: row });
}));

app.put('/api/documentos/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const existing = await queryOne('SELECT * FROM sgua_documentos WHERE id=$1', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Não encontrado.' });
  const b = req.body;
  const categoria = CATS_DOC.includes(b.categoria) ? b.categoria : existing.categoria;
  const publico = b.publico !== undefined ? (b.publico === 'true' || b.publico === true) : existing.publico;
  const row = await queryOne(
    `UPDATE sgua_documentos SET categoria=$1,titulo=$2,descricao=$3,publico=$4,tags=$5,ano=$6,autor=$7,unit_id=$8,updated_at=now()
     WHERE id=$9 RETURNING *`,
    [categoria,
     sanitizeText(b.titulo||existing.titulo,300),
     sanitizeText(b.descricao!==undefined?b.descricao:existing.descricao,2000),
     publico,
     sanitizeText(b.tags!==undefined?b.tags:existing.tags,300),
     b.ano?parseInt(b.ano):existing.ano,
     sanitizeText(b.autor!==undefined?b.autor:existing.autor,120),
     b.unit_id!==undefined?parsePositiveId(b.unit_id)||null:existing.unit_id,
     id]
  );
  auditLog(req, 'atualizar_documento', 'documentos', id, { publico });
  res.json({ ok: true, data: row });
}));

app.delete('/api/documentos/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const existing = await queryOne('SELECT * FROM sgua_documentos WHERE id=$1', [id]);
  if (!existing) return res.status(404).json({ ok: false, error: 'Não encontrado.' });
  if (existing.arquivo_url && existing.arquivo_url.startsWith('/uploads/docs/')) {
    const fpath = path.join(DOCS_DIR, path.basename(existing.arquivo_url));
    fs.unlink(fpath, ()=>{});
  }
  await query('DELETE FROM sgua_documentos WHERE id=$1', [id]);
  auditLog(req, 'deletar_documento', 'documentos', id, {});
  res.json({ ok: true });
}));

// ─── Backup ──────────────────────────────────────────────────────────────────

app.get('/api/backup', asyncRoute(async (_req, res) => {
  const rows = await query('SELECT id, created_at, label, size_kb FROM sgua_backups ORDER BY created_at DESC LIMIT 50');
  res.json({ ok: true, data: rows });
}));

app.post('/api/backup', requireAuth, asyncRoute(async (req, res) => {
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
  auditLog(req, 'criar_backup', 'backup', result.id, { label });
  res.status(201).json({ ok: true, data: result });
}));

app.get('/api/backup/:id', asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const row = await queryOne('SELECT * FROM sgua_backups WHERE id = $1', [id]);
  if (!row) return res.status(404).json({ ok: false, error: 'Backup não encontrado.' });
  res.json({ ok: true, data: row });
}));

app.post('/api/backup/:id/restore', requireAuth, asyncRoute(async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido.' });
  const backup = await queryOne('SELECT snapshot FROM sgua_backups WHERE id = $1', [id]);
  if (!backup) return res.status(404).json({ ok: false, error: 'Backup não encontrado.' });
  await query(
    "INSERT INTO app_state (key, value, updated_at) VALUES ('sgua', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [JSON.stringify(backup.snapshot)]
  );
  auditLog(req, 'restaurar_backup', 'backup', id, {});
  res.json({ ok: true });
}));

app.delete('/api/backup/:id', requireAuth, asyncRoute(async (req, res) => {
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

app.put('/api/reg-requests/:id', requireAuth, asyncRoute(async (req, res) => {
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

app.post('/api/notifications', requireAuth, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const result = await queryOne(
    'INSERT INTO sgua_notifications (user_id, tipo, canal, titulo, corpo) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [body.user_id||null, sanitizeText(body.tipo||'sistema',40), sanitizeText(body.canal||'sistema',20),
     sanitizeText(body.titulo||'',200), sanitizeText(body.corpo||'',600)]
  );
  res.status(201).json({ ok: true, data: result });
}));

app.put('/api/notifications/read-all', requireAuth, asyncRoute(async (req, res) => {
  const userId = parsePositiveId((req.body||{}).user_id);
  if (!userId) return res.status(400).json({ ok: false, error: 'user_id inválido.' });
  await query('UPDATE sgua_notifications SET lida=true WHERE user_id=$1', [userId]);
  res.json({ ok: true });
}));

app.put('/api/notifications/:id/read', requireAuth, asyncRoute(async (req, res) => {
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

app.put('/api/suggestions/:id', requireAuth, asyncRoute(async (req, res) => {
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

app.post('/api/email/test', requireAuth, asyncRoute(async (req, res) => {
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

app.post('/api/email/send', requireAuth, asyncRoute(async (req, res) => {
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
    logger.error('[DB]', err.message);
    return res.status(503).json({ ok: false, error: 'Serviço de banco de dados indisponível.' });
  }
  logger.error(err);
  res.status(500).json({ ok: false, error: 'Erro interno no servidor.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, async () => {
  logger.info(`SGUA executando em http://localhost:${PORT}`);
  logger.info(`Banco: PostgreSQL (Supabase)`);
  // Avisos de configuração opcional (não fatais)
  if (!process.env.ANTHROPIC_API_KEY) logger.warn('[Config] ANTHROPIC_API_KEY ausente — síntese de artigos por IA desabilitada.');
  if (!process.env.SMTP_HOST) logger.warn('[Config] SMTP_HOST ausente — notificações por e-mail desabilitadas.');
  if (process.env.RENDER) {
    logger.warn('[Aviso] Render.com free tier: uploads de fotos em disco são temporários e serão perdidos a cada redeploy. Configure um Persistent Disk ou migre para Supabase Storage para fotos permanentes.');
  }
  // Auto-criar tabelas
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS sgua_admin_users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(200) NOT NULL UNIQUE,
      nome VARCHAR(200) NOT NULL DEFAULT 'Admin',
      password_hash TEXT NOT NULL,
      perfil VARCHAR(30) DEFAULT 'gestor',
      permissoes JSONB DEFAULT '{}',
      ativo BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )`);
    // Seed admin padrão se a tabela estiver vazia
    if (bcrypt) {
      const { rows: admins } = await pool.query('SELECT id FROM sgua_admin_users LIMIT 1');
      if (admins.length === 0) {
        const defaultEmail = process.env.ADMIN_EMAIL || 'admin@sema.ac.gov.br';
        const defaultPass = process.env.ADMIN_PASSWORD || 'SemaAC@2026';
        const hash = await bcrypt.hash(defaultPass, 12);
        await pool.query(
          `INSERT INTO sgua_admin_users (email,nome,password_hash,perfil,permissoes) VALUES ($1,$2,$3,'admin',$4)
           ON CONFLICT (email) DO NOTHING`,
          [defaultEmail, 'Administrador SEMA', hash, JSON.stringify({units:true,news:true,users:true,sols:true,feeds:true,cfg:true,rel:true,backup:true,notif:true,ownUnits:false})]
        );
        logger.info('[Auth] Admin padrão criado: ' + defaultEmail);
      }
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS sgua_suggestions (
      id SERIAL PRIMARY KEY, texto TEXT NOT NULL, tipo VARCHAR(40) DEFAULT 'sistema',
      status VARCHAR(20) DEFAULT 'pendente', prioridade VARCHAR(20) DEFAULT 'media',
      impacto TEXT DEFAULT '', obs TEXT DEFAULT '', tags JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT now())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS sgua_feeds (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  url TEXT NOT NULL,
  categoria VARCHAR(100) DEFAULT 'Geral',
  ativo BOOLEAN DEFAULT true,
  status VARCHAR(30) DEFAULT 'aguardando',
  prioridade INTEGER DEFAULT 0,
  frequencia VARCHAR(20) DEFAULT 'diaria',
  palavras_chave TEXT DEFAULT '',
  metodo_detec VARCHAR(20) DEFAULT 'rss',
  ultimo_sync TIMESTAMPTZ,
  ultimo_erro TEXT DEFAULT '',
  total_noticias INTEGER DEFAULT 0,
  falhas_consecutivas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT sgua_feeds_url_unique UNIQUE (url)
)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS sgua_feed_logs (
      id SERIAL PRIMARY KEY, feed_id INTEGER NOT NULL, tipo VARCHAR(20) DEFAULT 'sync',
      ok BOOLEAN DEFAULT true, mensagem TEXT DEFAULT '',
      itens_adicionados INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now())`);
    await pool.query(`ALTER TABLE sgua_feeds ADD COLUMN IF NOT EXISTS palavras_chave TEXT DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE sgua_feeds ADD COLUMN IF NOT EXISTS metodo_detec VARCHAR(20) DEFAULT 'rss'`).catch(()=>{});
    await pool.query(`ALTER TABLE sgua_feeds ADD COLUMN IF NOT EXISTS quantidade_diaria INTEGER DEFAULT 10`).catch(()=>{});
    await pool.query(`ALTER TABLE sgua_feeds ADD COLUMN IF NOT EXISTS noticias_hoje INTEGER DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE sgua_feeds ADD COLUMN IF NOT EXISTS ultima_reset DATE DEFAULT CURRENT_DATE`).catch(()=>{});
    await pool.query(`ALTER TABLE sgua_feeds ADD COLUMN IF NOT EXISTS usar_ia BOOLEAN DEFAULT false`).catch(()=>{});
    await pool.query(`ALTER TABLE sgua_feeds ADD COLUMN IF NOT EXISTS prompt_ia TEXT DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE news ADD COLUMN IF NOT EXISTS visivel BOOLEAN DEFAULT true`).catch(()=>{});
    await pool.query(`ALTER TABLE news ADD COLUMN IF NOT EXISTS destaque BOOLEAN DEFAULT false`).catch(()=>{});
    await pool.query(`ALTER TABLE news ADD COLUMN IF NOT EXISTS resumo TEXT DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE news ADD COLUMN IF NOT EXISTS unidade TEXT DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE news ADD COLUMN IF NOT EXISTS autor_nome TEXT DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE news ADD COLUMN IF NOT EXISTS fonte TEXT DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE news ADD COLUMN IF NOT EXISTS data_pub DATE`).catch(()=>{});
    try { await pool.query(`ALTER TABLE sgua_feeds ADD CONSTRAINT sgua_feeds_url_unique UNIQUE (url)`); } catch(_){}
    // Índices para colunas frequentemente filtradas / chaves estrangeiras (idempotente)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_feed_logs_feed_id ON sgua_feed_logs(feed_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON sgua_notifications(user_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_occupancy_unit_id ON occupancy_records(unit_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_occupancy_user_id ON occupancy_records(user_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_news_is_rss ON news(is_rss)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_news_created_at ON news(created_at DESC)`).catch(()=>{});
    await pool.query(`CREATE TABLE IF NOT EXISTS sgua_ocorrencias (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      tipo VARCHAR(40) NOT NULL DEFAULT 'outro',
      severidade VARCHAR(20) NOT NULL DEFAULT 'media',
      status VARCHAR(20) NOT NULL DEFAULT 'aberta',
      titulo VARCHAR(200) NOT NULL,
      descricao TEXT DEFAULT '',
      acao_tomada TEXT DEFAULT '',
      responsavel VARCHAR(120) DEFAULT '',
      data_ocorrencia DATE NOT NULL DEFAULT CURRENT_DATE,
      data_resolucao DATE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS sgua_ordens (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      tipo VARCHAR(40) NOT NULL DEFAULT 'corretiva',
      prioridade VARCHAR(20) NOT NULL DEFAULT 'normal',
      status VARCHAR(20) NOT NULL DEFAULT 'pendente',
      titulo VARCHAR(200) NOT NULL,
      descricao TEXT DEFAULT '',
      responsavel VARCHAR(120) DEFAULT '',
      fornecedor VARCHAR(120) DEFAULT '',
      custo_estimado NUMERIC(10,2),
      custo_real NUMERIC(10,2),
      data_prevista DATE,
      data_conclusao DATE,
      observacoes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS sgua_audit_log (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER,
      usuario_email VARCHAR(200),
      acao VARCHAR(60) NOT NULL,
      entidade VARCHAR(60),
      entidade_id INTEGER,
      detalhes JSONB DEFAULT '{}',
      ip VARCHAR(60),
      created_at TIMESTAMPTZ DEFAULT now()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ocorrencias_unit_id ON sgua_ocorrencias(unit_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ordens_unit_id ON sgua_ordens(unit_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON sgua_audit_log(created_at DESC)`).catch(()=>{});
    await pool.query(`CREATE TABLE IF NOT EXISTS sgua_agenda (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
      tipo VARCHAR(40) NOT NULL DEFAULT 'reuniao',
      status VARCHAR(20) NOT NULL DEFAULT 'agendado',
      titulo VARCHAR(200) NOT NULL,
      descricao TEXT DEFAULT '',
      local VARCHAR(200) DEFAULT '',
      responsavel VARCHAR(120) DEFAULT '',
      data_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
      data_fim TIMESTAMPTZ,
      participantes TEXT DEFAULT '',
      resultado TEXT DEFAULT '',
      created_by VARCHAR(200) DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agenda_data_inicio ON sgua_agenda(data_inicio)`).catch(()=>{});
    await pool.query(`CREATE TABLE IF NOT EXISTS sgua_equipamentos (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      nome VARCHAR(200) NOT NULL,
      tipo VARCHAR(40) NOT NULL DEFAULT 'outro',
      marca VARCHAR(120) DEFAULT '',
      modelo VARCHAR(120) DEFAULT '',
      numero_serie VARCHAR(120) DEFAULT '',
      patrimonio VARCHAR(80) DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'operacional',
      data_aquisicao DATE,
      valor_aquisicao NUMERIC(12,2),
      responsavel VARCHAR(120) DEFAULT '',
      localizacao VARCHAR(200) DEFAULT '',
      obs TEXT DEFAULT '',
      ultima_manutencao DATE,
      proxima_manutencao DATE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS sgua_documentos (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
      categoria VARCHAR(40) NOT NULL DEFAULT 'outro',
      titulo VARCHAR(300) NOT NULL,
      descricao TEXT DEFAULT '',
      arquivo_url TEXT DEFAULT '',
      arquivo_nome VARCHAR(300) DEFAULT '',
      arquivo_tipo VARCHAR(80) DEFAULT '',
      arquivo_tamanho INTEGER DEFAULT 0,
      publico BOOLEAN NOT NULL DEFAULT false,
      tags TEXT DEFAULT '',
      ano INTEGER,
      autor VARCHAR(120) DEFAULT '',
      created_by VARCHAR(200) DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_equipamentos_unit_id ON sgua_equipamentos(unit_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_documentos_publico ON sgua_documentos(publico, created_at DESC)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sgua_feeds_ativo ON sgua_feeds(ativo)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sgua_feed_logs_feed_id ON sgua_feed_logs(feed_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_news_data_pub ON news(data_pub DESC NULLS LAST)`).catch(()=>{});
    // Migrar feeds do app_state se sgua_feeds estiver vazia (primeira instalação)
    const { rows: exFeeds } = await pool.query('SELECT id FROM sgua_feeds LIMIT 1');
    if (exFeeds.length === 0) {
      const row = await queryOne("SELECT value FROM app_state WHERE key='sgua'");
      if (row?.value?.feeds?.length) {
        for (const f of row.value.feeds) {
          if (!f.url || !f.nome) continue;
          await pool.query(
            'INSERT INTO sgua_feeds (nome,url,categoria,ativo,status) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (url) DO NOTHING',
            [String(f.nome).slice(0,200), String(f.url).trim(), String(f.categoria||'Geral').slice(0,100), f.ativo !== false, 'aguardando']
          ).catch(()=>{});
        }
        logger.info('[DB] Feeds migrados do app_state para sgua_feeds');
      }
    }
    // Garantir que feeds padrão ambientais existam (ON CONFLICT DO NOTHING preserva configurações do usuário)
    const FDS_DEFAULTS = [
      {nome:'Agência Brasil — Meio Ambiente',url:'https://agenciabrasil.ebc.com.br/rss/meio-ambiente/feed.rss',categoria:'Monitoramento',ativo:true},
      {nome:'Agência Brasil — Amazônia',url:'https://agenciabrasil.ebc.com.br/rss/amazonia/feed.rss',categoria:'Geral',ativo:true},
      {nome:'Ministério do Meio Ambiente',url:'https://www.gov.br/mma/pt-br/assuntos/noticias/RSS',categoria:'Legislação',ativo:true},
      {nome:'INPE — Notícias',url:'https://www.inpe.br/rss/noticias.php',categoria:'Monitoramento',ativo:true},
      {nome:'Portal SEMA/AC',url:'https://sema.ac.gov.br/feed',categoria:'Gestão',ativo:true},
      {nome:'Agência Brasil — Geral (exemplo — pode editar)',url:'https://agenciabrasil.ebc.com.br/rss/geral/feed.rss',categoria:'Geral',ativo:false}
    ];
    for (const fd of FDS_DEFAULTS) {
      await pool.query(
        'INSERT INTO sgua_feeds (nome,url,categoria,ativo,status) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (url) DO NOTHING',
        [fd.nome, fd.url, fd.categoria, fd.ativo, 'aguardando']
      ).catch(()=>{});
    }
    logger.info('[DB] Feeds padrão verificados/inseridos');
  } catch(e) { logger.error('[DB] startup init failed:', e.message); }
});

// ─── Robustez de processo: erros não tratados + desligamento gracioso ──────────
process.on('unhandledRejection', (reason) => {
  logger.error('[unhandledRejection]', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  logger.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
let _shuttingDown = false;
function gracefulShutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  logger.info(`[Shutdown] Sinal ${signal} recebido — encerrando com segurança...`);
  server.close(() => {
    pool.end().then(() => {
      logger.info('[Shutdown] Conexões encerradas. Até logo.');
      process.exit(0);
    }).catch(() => process.exit(0));
  });
  // Failsafe: força saída se o close demorar demais
  setTimeout(() => { logger.warn('[Shutdown] Timeout — forçando saída.'); process.exit(1); }, 10000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Backup semanal automático (toda domingo às 02:00 horário de Brasília / 07:00 UTC) ────

cron.schedule('0 7 * * 0', async () => {
  try {
    const row = await queryOne("SELECT value FROM app_state WHERE key = 'sgua'");
    if (!row) { logger.warn('[Backup] app_state não encontrado.'); return; }
    const json = JSON.stringify(row.value);
    const sizeKb = Math.ceil(Buffer.byteLength(json, 'utf8') / 1024);
    const label = `Auto — ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' })}`;
    await query('INSERT INTO sgua_backups (label, snapshot, size_kb) VALUES ($1, $2, $3)', [label, row.value, sizeKb]);
    // Retenção: manter apenas os 30 backups mais recentes
    await query('DELETE FROM sgua_backups WHERE id NOT IN (SELECT id FROM sgua_backups ORDER BY created_at DESC LIMIT 30)');
    logger.info(`[Backup] Automático concluído — ${sizeKb} KB`);
  } catch (err) {
    logger.error('[Backup] Falha no backup automático:', err.message);
  }
}, { timezone: 'UTC' });

// Cron: daily 06:00 UTC — sincronizar RSS feeds
cron.schedule('0 6 * * *', async () => {
  try {
    const isSaturday = new Date().getDay() === 6;
    const freqClause = isSaturday ? "(frequencia='diaria' OR frequencia='semanal')" : "frequencia='diaria'";
    const feeds = await query(`SELECT * FROM sgua_feeds WHERE ativo=true AND ${freqClause}`);
    if (!feeds.length) { logger.info('[CRON-RSS] Sem feeds ativos'); return; }
    let totalAdded = 0;
    const warnings = [];
    for (const f of feeds) {
      try {
        await pool.query('UPDATE sgua_feeds SET status=$1,updated_at=now() WHERE id=$2',['sincronizando',f.id]);
        const result = await fetchSmartItems(f);
        if (!result.ok) {
          const errStatus = result.error==='timeout' ? 'sem_resposta' : 'invalido';
          await pool.query('UPDATE sgua_feeds SET status=$1,ultimo_erro=$2,falhas_consecutivas=falhas_consecutivas+1,updated_at=now() WHERE id=$3',
            [errStatus, String(result.error||'').slice(0,500), f.id]);
          warnings.push(f.nome+': '+result.error);
          const fdCheck2 = await queryOne('SELECT falhas_consecutivas FROM sgua_feeds WHERE id=$1',[f.id]);
          if (fdCheck2 && fdCheck2.falhas_consecutivas >= 5) {
            await pool.query('UPDATE sgua_feeds SET ativo=false,status=\'pausado\',updated_at=now() WHERE id=$1',[f.id]);
            await pool.query('INSERT INTO sgua_feed_logs (feed_id,tipo,ok,mensagem) VALUES ($1,$2,$3,$4)',
              [f.id,'auto_pause',false,'Feed pausado automaticamente após 5 falhas consecutivas']);
          }
          continue;
        }
        const toInsertCron = result.items.filter(function(item){return itemPassaFiltro(item, f.palavras_chave||'');});
        let added = 0;
        for (const item of toInsertCron) {
          item._metodo = result.metodo || 'rss';
          const n = await inserirArtigo(item, f);
          added += n;
        }
        await pool.query('UPDATE sgua_feeds SET status=$1,ultimo_sync=now(),ultimo_erro=$2,falhas_consecutivas=0,total_noticias=total_noticias+$3,metodo_detec=$4,updated_at=now() WHERE id=$5',
          ['ativo','',added,result.metodo||'rss',f.id]);
        await pool.query('INSERT INTO sgua_feed_logs (feed_id,tipo,ok,mensagem,itens_adicionados) VALUES ($1,$2,$3,$4,$5)',
          [f.id,'sync',true,`Cron sync: ${added} nova(s)`,added]);
        totalAdded += added;
      } catch(e){ warnings.push(f.nome+': '+e.message); }
    }
    logger.info(`[CRON-RSS] ${totalAdded} novas notícias. Avisos: ${warnings.length}`);
  } catch(e){ logger.error('[CRON-RSS] Falha:',e.message); }
}, { timezone: 'UTC' });

// Cron: reset cota diária (meia-noite UTC)
cron.schedule('0 0 * * *', async () => {
  try {
    await pool.query("UPDATE sgua_feeds SET noticias_hoje=0, ultima_reset=CURRENT_DATE WHERE ultima_reset < CURRENT_DATE OR ultima_reset IS NULL");
    logger.info('[CRON-RESET] Cotas diárias resetadas');
  } catch(e){ logger.error('[CRON-RESET] Falha:',e.message); }
}, { timezone: 'UTC' });
