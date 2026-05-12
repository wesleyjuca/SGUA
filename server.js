'use strict';
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL e SUPABASE_KEY não definidos no .env');
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// ─── Crypto ────────────────────────────────────────────────────────────────
function genSalt()          { return crypto.randomBytes(16).toString('hex'); }
function hashPwd(pwd, salt) { return crypto.pbkdf2Sync(pwd, salt, 100_000, 32, 'sha256').toString('hex'); }
function verifyPwd(p, s, h) { return hashPwd(p, s) === h; }
function genToken()         { return crypto.randomBytes(32).toString('hex'); }
function today()            { return new Date().toISOString().split('T')[0]; }

// ─── Error helper ──────────────────────────────────────────────────────────
function err500(res, e) {
  console.error('[SGUA]', e?.message || e);
  res.status(500).json({ ok: false, error: e?.message || 'Erro interno' });
}

// ─── Auth middleware ───────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Não autenticado' });

  const { data: sess, error } = await supa
    .from('sessoes')
    .select('usuario_id, expira_em, usuarios(id, nome, email, perfil, ativo, permissoes)')
    .eq('token', token)
    .gt('expira_em', new Date().toISOString())
    .maybeSingle();

  if (error || !sess || !sess.usuarios?.ativo)
    return res.status(401).json({ ok: false, error: 'Sessão inválida ou expirada' });

  const u = sess.usuarios;
  req.user = { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, permissoes: u.permissoes || {} };
  req.token = token;
  next();
}

function requirePerm(key) {
  return (req, res, next) => {
    if (req.user.perfil === 'admin' || req.user.permissoes[key])
      return next();
    return res.status(403).json({ ok: false, error: 'Sem permissão para esta ação' });
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body || {};
    if (!email || !senha) return res.status(400).json({ ok: false, error: 'Email e senha obrigatórios' });

    const { data: u } = await supa.from('usuarios').select('*').eq('email', email.trim().toLowerCase()).eq('ativo', true).maybeSingle();
    if (!u || !verifyPwd(senha, u.pwd_salt, u.pwd_hash))
      return res.status(401).json({ ok: false, error: 'Credenciais inválidas' });

    const token   = genToken();
    const expira  = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
    await supa.from('sessoes').insert({ token, usuario_id: u.id, expira_em: expira });

    res.json({ ok: true, token, expira, usuario: { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, permissoes: u.permissoes || {} } });
  } catch (e) { err500(res, e); }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await supa.from('sessoes').delete().eq('token', req.token);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ ok: true, usuario: req.user }));

// ═══════════════════════════════════════════════════════════════════════════
// UNIDADES
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/unidades', async (req, res) => {
  try {
    let q = supa.from('unidades').select('*, orgaos_presentes(*)').order('tipo').order('nome');
    if (req.query.tipo)     q = q.eq('tipo', req.query.tipo);
    if (req.query.municipio) q = q.eq('municipio', req.query.municipio);
    if (req.query.status)   q = q.eq('status', req.query.status);
    if (req.query.visivel !== undefined) q = q.eq('visivel', req.query.visivel === 'true');

    const { data, error } = await q;
    if (error) throw error;
    const unidades = (data || []).map(u => ({
      ...u,
      coords: u.lat && u.lng ? { lat: u.lat, lng: u.lng } : null,
      taxaUso: u.taxa_uso,
      orgaosPresentes: u.orgaos_presentes || [],
      ocupacaoAtual: (u.orgaos_presentes || []).filter(o => o.ativo).length
    }));
    res.json({ ok: true, unidades });
  } catch (e) { err500(res, e); }
});

app.get('/api/unidades/:id', async (req, res) => {
  try {
    const { data: u, error } = await supa.from('unidades').select('*, orgaos_presentes(*)').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!u) return res.status(404).json({ ok: false, error: 'Unidade não encontrada' });
    res.json({ ok: true, unidade: { ...u, coords: u.lat && u.lng ? { lat: u.lat, lng: u.lng } : null, taxaUso: u.taxa_uso, orgaosPresentes: u.orgaos_presentes || [], ocupacaoAtual: (u.orgaos_presentes || []).filter(o => o.ativo).length } });
  } catch (e) { err500(res, e); }
});

app.post('/api/unidades', requireAuth, requirePerm('units'), async (req, res) => {
  try {
    const d = req.body;
    if (!d.tipo || !d.nome || !d.municipio)
      return res.status(400).json({ ok: false, error: 'tipo, nome e municipio são obrigatórios' });
    const { data, error } = await supa.from('unidades').insert({
      tipo: d.tipo, nome: d.nome, municipio: d.municipio, regional: d.regional || '',
      lat: d.lat || null, lng: d.lng || null, status: d.status || 'ativo',
      taxa_uso: d.taxaUso || 0, capacidade: d.capacidade || 0,
      descricao: d.descricao || '', historia: d.historia || '', decreto: d.decreto || '',
      orgaos: d.orgaos || [], quartos: d.quartos || 0, salas: d.salas || 0,
      cozinha: !!d.cozinha, auditorio: !!d.auditorio, visivel: d.visivel !== false,
      foto: d.foto || '', galeria: d.galeria || [], extras: d.extras || []
    }).select().single();
    if (error) throw error;
    res.status(201).json({ ok: true, unidade: { ...data, coords: data.lat && data.lng ? { lat: data.lat, lng: data.lng } : null, taxaUso: data.taxa_uso, orgaosPresentes: [], ocupacaoAtual: 0 } });
  } catch (e) { err500(res, e); }
});

app.put('/api/unidades/:id', requireAuth, requirePerm('units'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supa.from('unidades').update({
      tipo: d.tipo, nome: d.nome, municipio: d.municipio, regional: d.regional || '',
      lat: d.lat || null, lng: d.lng || null, status: d.status || 'ativo',
      taxa_uso: d.taxaUso || 0, capacidade: d.capacidade || 0,
      descricao: d.descricao || '', historia: d.historia || '', decreto: d.decreto || '',
      orgaos: d.orgaos || [], quartos: d.quartos || 0, salas: d.salas || 0,
      cozinha: !!d.cozinha, auditorio: !!d.auditorio, visivel: d.visivel !== false,
      foto: d.foto || '', galeria: d.galeria || [], extras: d.extras || []
    }).eq('id', req.params.id).select('*, orgaos_presentes(*)').single();
    if (error) throw error;
    res.json({ ok: true, unidade: { ...data, coords: data.lat && data.lng ? { lat: data.lat, lng: data.lng } : null, taxaUso: data.taxa_uso, orgaosPresentes: data.orgaos_presentes || [], ocupacaoAtual: (data.orgaos_presentes || []).filter(o => o.ativo).length } });
  } catch (e) { err500(res, e); }
});

app.delete('/api/unidades/:id', requireAuth, requirePerm('units'), async (req, res) => {
  try {
    const { error } = await supa.from('unidades').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { err500(res, e); }
});

// ─── Órgãos presentes ──────────────────────────────────────────────────────
app.get('/api/unidades/:id/orgaos', async (req, res) => {
  try {
    const { data, error } = await supa.from('orgaos_presentes').select('*').eq('unidade_id', req.params.id).order('data_entrada', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, orgaos: data });
  } catch (e) { err500(res, e); }
});

app.post('/api/unidades/:id/orgaos', requireAuth, async (req, res) => {
  try {
    const { data: u } = await supa.from('unidades').select('status').eq('id', req.params.id).maybeSingle();
    if (!u) return res.status(404).json({ ok: false, error: 'Unidade não encontrada' });
    if (u.status === 'inativo') return res.status(400).json({ ok: false, error: 'Unidade inativa não pode receber órgãos' });

    const { nome, tipo } = req.body || {};
    if (!nome || !tipo) return res.status(400).json({ ok: false, error: 'nome e tipo são obrigatórios' });

    const { data: dup } = await supa.from('orgaos_presentes').select('id').eq('unidade_id', req.params.id).eq('ativo', true).ilike('nome', nome).maybeSingle();
    if (dup) return res.status(409).json({ ok: false, error: `Órgão "${nome}" já está ativo nesta unidade` });

    const { data, error } = await supa.from('orgaos_presentes').insert({ unidade_id: req.params.id, nome, tipo, data_entrada: today(), ativo: true }).select().single();
    if (error) throw error;
    res.status(201).json({ ok: true, orgao: data });
  } catch (e) { err500(res, e); }
});

app.put('/api/unidades/:id/orgaos/:orgId', requireAuth, async (req, res) => {
  try {
    const ativo = req.body.ativo !== false && req.body.ativo !== 0;
    const { data, error } = await supa.from('orgaos_presentes')
      .update({ ativo, data_saida: ativo ? null : today() })
      .eq('id', req.params.orgId).eq('unidade_id', req.params.id).select().single();
    if (error) throw error;
    res.json({ ok: true, orgao: data });
  } catch (e) { err500(res, e); }
});

app.delete('/api/unidades/:id/orgaos/:orgId', requireAuth, async (req, res) => {
  try {
    const { error } = await supa.from('orgaos_presentes')
      .update({ ativo: false, data_saida: today() })
      .eq('id', req.params.orgId).eq('unidade_id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { err500(res, e); }
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTÍCIAS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/noticias', async (req, res) => {
  try {
    let q = supa.from('noticias').select('*').order('data', { ascending: false }).order('id', { ascending: false });
    if (req.query.visivel  !== undefined) q = q.eq('visivel', req.query.visivel === 'true');
    if (req.query.destaque !== undefined) q = q.eq('destaque', req.query.destaque === 'true');
    const { data, error } = await q;
    if (error) throw error;
    res.json({ ok: true, noticias: data });
  } catch (e) { err500(res, e); }
});

app.get('/api/noticias/:id', async (req, res) => {
  try {
    const { data, error } = await supa.from('noticias').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, error: 'Notícia não encontrada' });
    res.json({ ok: true, noticia: data });
  } catch (e) { err500(res, e); }
});

app.post('/api/noticias', requireAuth, requirePerm('news'), async (req, res) => {
  try {
    const d = req.body;
    if (!d.titulo || !d.data) return res.status(400).json({ ok: false, error: 'titulo e data são obrigatórios' });
    const { data, error } = await supa.from('noticias').insert({ titulo: d.titulo, resumo: d.resumo || '', conteudo: d.conteudo || '', data: d.data, categoria: d.categoria || '', unidade: d.unidade || '', destaque: !!d.destaque, visivel: d.visivel !== false, fonte: d.fonte || '', autor: d.autor || '' }).select().single();
    if (error) throw error;
    res.status(201).json({ ok: true, noticia: data });
  } catch (e) { err500(res, e); }
});

app.put('/api/noticias/:id', requireAuth, requirePerm('news'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supa.from('noticias').update({ titulo: d.titulo, resumo: d.resumo || '', conteudo: d.conteudo || '', data: d.data, categoria: d.categoria || '', unidade: d.unidade || '', destaque: !!d.destaque, visivel: d.visivel !== false, fonte: d.fonte || '', autor: d.autor || '' }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ ok: true, noticia: data });
  } catch (e) { err500(res, e); }
});

app.delete('/api/noticias/:id', requireAuth, requirePerm('news'), async (req, res) => {
  try {
    const { error } = await supa.from('noticias').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { err500(res, e); }
});

// ═══════════════════════════════════════════════════════════════════════════
// FEEDS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/feeds', async (req, res) => {
  try {
    const { data, error } = await supa.from('feeds').select('*').order('nome');
    if (error) throw error;
    res.json({ ok: true, feeds: data });
  } catch (e) { err500(res, e); }
});

app.post('/api/feeds', requireAuth, requirePerm('feeds'), async (req, res) => {
  try {
    const { nome, url, ativo, categoria } = req.body || {};
    if (!nome || !url) return res.status(400).json({ ok: false, error: 'nome e url são obrigatórios' });
    const { data, error } = await supa.from('feeds').insert({ nome, url, ativo: ativo !== false, categoria: categoria || '' }).select().single();
    if (error) throw error;
    res.status(201).json({ ok: true, feed: data });
  } catch (e) { err500(res, e); }
});

app.put('/api/feeds/:id', requireAuth, requirePerm('feeds'), async (req, res) => {
  try {
    const { nome, url, ativo, categoria } = req.body || {};
    const { data, error } = await supa.from('feeds').update({ nome, url, ativo: !!ativo, categoria: categoria || '' }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ ok: true, feed: data });
  } catch (e) { err500(res, e); }
});

app.delete('/api/feeds/:id', requireAuth, requirePerm('feeds'), async (req, res) => {
  try {
    const { error } = await supa.from('feeds').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { err500(res, e); }
});

// ═══════════════════════════════════════════════════════════════════════════
// SOLICITAÇÕES
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/solicitacoes', async (req, res) => {
  try {
    const d = req.body || {};
    if (!d.solicitante || !d.unidade)
      return res.status(400).json({ ok: false, error: 'solicitante e unidade são obrigatórios' });
    const id = 'SOL-' + Date.now();
    const { data, error } = await supa.from('solicitacoes').insert({ id, solicitante: d.solicitante, organizacao: d.organizacao || '', unidade: d.unidade, evento: d.evento || '', data_evento: d.dataEvento || null, status: 'pendente' }).select().single();
    if (error) throw error;
    res.status(201).json({ ok: true, solicitacao: data });
  } catch (e) { err500(res, e); }
});

app.get('/api/solicitacoes', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supa.from('solicitacoes').select('*').order('criado_em', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, solicitacoes: data });
  } catch (e) { err500(res, e); }
});

app.put('/api/solicitacoes/:id', requireAuth, requirePerm('sols'), async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['pendente','aprovada','rejeitada'].includes(status))
      return res.status(400).json({ ok: false, error: 'Status inválido' });

    const { data: s } = await supa.from('solicitacoes').select('*').eq('id', req.params.id).maybeSingle();
    if (!s) return res.status(404).json({ ok: false, error: 'Solicitação não encontrada' });

    if (status === 'aprovada') {
      const { data: un } = await supa.from('unidades').select('id, status').eq('nome', s.unidade).neq('status', 'inativo').maybeSingle();
      if (!un) return res.status(400).json({ ok: false, error: `Unidade "${s.unidade}" não encontrada ou inativa` });

      const { data: dup } = await supa.from('orgaos_presentes').select('id').eq('unidade_id', un.id).eq('ativo', true).ilike('nome', s.organizacao || s.solicitante).maybeSingle();
      if (dup) return res.status(409).json({ ok: false, error: 'Órgão já está ativo nesta unidade' });

      await supa.from('orgaos_presentes').insert({ unidade_id: un.id, nome: s.organizacao || s.solicitante, tipo: s.evento || 'Evento', data_entrada: s.data_evento || today(), ativo: true });
    }

    const { data, error } = await supa.from('solicitacoes').update({ status }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ ok: true, solicitacao: data });
  } catch (e) { err500(res, e); }
});

app.delete('/api/solicitacoes/:id', requireAuth, requirePerm('sols'), async (req, res) => {
  try {
    const { error } = await supa.from('solicitacoes').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { err500(res, e); }
});

// ═══════════════════════════════════════════════════════════════════════════
// USUÁRIOS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/usuarios', requireAuth, requirePerm('users'), async (req, res) => {
  try {
    const { data, error } = await supa.from('usuarios').select('id,nome,email,perfil,ativo,permissoes,criado_em').order('nome');
    if (error) throw error;
    res.json({ ok: true, usuarios: data });
  } catch (e) { err500(res, e); }
});

app.post('/api/usuarios', requireAuth, requirePerm('users'), async (req, res) => {
  try {
    const d = req.body || {};
    if (!d.nome || !d.email || !d.senha)
      return res.status(400).json({ ok: false, error: 'nome, email e senha são obrigatórios' });
    const { data: ex } = await supa.from('usuarios').select('id').eq('email', d.email.toLowerCase()).maybeSingle();
    if (ex) return res.status(409).json({ ok: false, error: 'Email já cadastrado' });
    const salt = genSalt();
    const perfis = { admin:{units:true,news:true,users:true,sols:true,feeds:true,cfg:true,rel:true}, gestor:{units:true,news:true,users:false,sols:true,feeds:false,cfg:false,rel:true}, viewer:{} };
    const { data, error } = await supa.from('usuarios').insert({ nome: d.nome, email: d.email.toLowerCase(), pwd_hash: hashPwd(d.senha, salt), pwd_salt: salt, perfil: d.perfil || 'viewer', ativo: d.ativo !== false, permissoes: d.permissoes || perfis[d.perfil] || {} }).select('id,nome,email,perfil,ativo,permissoes,criado_em').single();
    if (error) throw error;
    res.status(201).json({ ok: true, usuario: data });
  } catch (e) { err500(res, e); }
});

app.put('/api/usuarios/:id', requireAuth, requirePerm('users'), async (req, res) => {
  try {
    const d = req.body || {};
    const update = { nome: d.nome, email: d.email?.toLowerCase(), perfil: d.perfil, ativo: d.ativo, permissoes: d.permissoes };
    if (d.senha) { const salt = genSalt(); update.pwd_salt = salt; update.pwd_hash = hashPwd(d.senha, salt); }
    const { data, error } = await supa.from('usuarios').update(update).eq('id', req.params.id).select('id,nome,email,perfil,ativo,permissoes,criado_em').single();
    if (error) throw error;
    res.json({ ok: true, usuario: data });
  } catch (e) { err500(res, e); }
});

app.delete('/api/usuarios/:id', requireAuth, requirePerm('users'), async (req, res) => {
  try {
    if (req.user.id === Number(req.params.id))
      return res.status(400).json({ ok: false, error: 'Não pode remover a si mesmo' });
    const { error } = await supa.from('usuarios').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { err500(res, e); }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/configuracoes', async (req, res) => {
  try {
    const { data, error } = await supa.from('configuracoes').select('chave,valor');
    if (error) throw error;
    const cfg = {};
    (data || []).forEach(r => { cfg[r.chave] = r.valor; });
    res.json({ ok: true, configuracoes: cfg });
  } catch (e) { err500(res, e); }
});

app.put('/api/configuracoes', requireAuth, requirePerm('cfg'), async (req, res) => {
  try {
    const d = req.body || {};
    const rows = Object.entries(d).map(([chave, valor]) => ({ chave, valor }));
    const { error } = await supa.from('configuracoes').upsert(rows, { onConflict: 'chave' });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { err500(res, e); }
});

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH + COMPATIBILIDADE /api/state
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/health', async (_req, res) => {
  try {
    const { error } = await supa.from('configuracoes').select('chave').limit(1);
    res.json({ ok: !error, db: 'supabase', url: SUPABASE_URL, now: new Date().toISOString() });
  } catch (e) { res.json({ ok: false, error: e.message }); }
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
    const [{ data: uns }, { data: news }, { data: feeds }, { data: sols }, { data: users }, { data: cfgRows }] = await Promise.all([
      supa.from('unidades').select('*, orgaos_presentes(*)').order('tipo').order('nome'),
      supa.from('noticias').select('*').order('data', { ascending: false }),
      supa.from('feeds').select('*').order('nome'),
      supa.from('solicitacoes').select('*').order('criado_em', { ascending: false }),
      supa.from('usuarios').select('id,nome,email,perfil,ativo,permissoes').order('nome'),
      supa.from('configuracoes').select('chave,valor')
    ]);
    const secs = {};
    (cfgRows || []).forEach(r => { secs[r.chave] = r.valor; });

    const unsFull = (uns || []).map(u => ({
      ...u, id: u.id,
      coords: u.lat && u.lng ? { lat: u.lat, lng: u.lng } : null,
      taxaUso: u.taxa_uso,
      orgaosPresentes: u.orgaos_presentes || [],
      ocupacaoAtual: (u.orgaos_presentes || []).filter(o => o.ativo).length
    }));

    res.json({
      ok: true,
      uns: unsFull,
      news: news || [],
      feeds: feeds || [],
      sols: (sols || []).map(s => ({ id: s.id, sol: s.solicitante, org: s.organizacao, un: s.unidade, ev: s.evento, dt: s.data_evento, st: s.status })),
      users: users || [],
      secs,
      updatedAt: new Date().toISOString()
    });
  } catch (e) { err500(res, e); }
});

// SPA fallback
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── Boot ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 SGUA rodando em http://localhost:${PORT}`);
  console.log(`   Supabase: ${SUPABASE_URL}\n`);
});
