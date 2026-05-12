'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL e SUPABASE_KEY são obrigatórios no .env');
  process.exit(1);
}

const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];

// ─── Chamada REST ao Supabase (fetch nativo ou https) ───────────────────────
function supaFetch(endpoint, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SUPABASE_URL);
    const body = opts.body ? JSON.stringify(opts.body) : undefined;
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: opts.method || 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...(opts.headers || {})
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── Executa SQL via Management API ─────────────────────────────────────────
async function execSql(sql) {
  const res = await supaFetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_KEY}` },
    body: { query: sql }
  });
  return res;
}

// ─── Hash PBKDF2 ─────────────────────────────────────────────────────────────
function genSalt() { return crypto.randomBytes(16).toString('hex'); }
function hashPwd(pwd, salt) {
  return crypto.pbkdf2Sync(pwd, salt, 100_000, 32, 'sha256').toString('hex');
}

// ─── Seed via REST API ───────────────────────────────────────────────────────
async function seedTable(table, rows) {
  const res = await supaFetch(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal,resolution=ignore-duplicates', 'On-Conflict': 'id' },
    body: rows
  });
  if (res.status >= 300 && res.status !== 409) {
    console.warn(`  ⚠ ${table}: status ${res.status}`, JSON.stringify(res.body).slice(0, 120));
  }
  return res;
}

async function checkTable(table) {
  const res = await supaFetch(`/rest/v1/${table}?limit=0`);
  return res.status < 400;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 SGUA — Migração Supabase');
  console.log(`   Projeto: ${projectRef}\n`);

  // 1. Tentar aplicar schema via Management API
  const sqlFile = path.join(__dirname, '..', 'migrations', '001_schema.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  console.log('📋 Aplicando schema SQL...');
  const sqlRes = await execSql(sql);

  if (sqlRes.status === 200 || sqlRes.status === 201) {
    console.log('✅ Schema aplicado via Management API');
  } else {
    console.log(`⚠  Management API retornou ${sqlRes.status} — pode precisar de token de gerenciamento.`);
    console.log('   Verifique se as tabelas já existem antes de continuar...\n');
  }

  // 2. Verificar tabelas principais
  console.log('🔍 Verificando tabelas...');
  const tables = ['usuarios', 'unidades', 'orgaos_presentes', 'noticias', 'feeds', 'solicitacoes', 'sessoes', 'configuracoes'];
  let allOk = true;
  for (const t of tables) {
    const ok = await checkTable(t);
    console.log(`   ${ok ? '✅' : '❌'} ${t}`);
    if (!ok) allOk = false;
  }

  if (!allOk) {
    console.log('\n❌ Algumas tabelas não existem. Execute o SQL abaixo no Supabase SQL Editor:');
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`);
    console.log('─'.repeat(60));
    console.log(sql);
    console.log('─'.repeat(60));
    process.exit(1);
  }

  // 3. Verificar se já há dados
  const usrRes = await supaFetch('/rest/v1/usuarios?select=count&limit=1', { headers: { 'Prefer': 'count=exact' } });
  const total = parseInt(usrRes.status === 200 ? (usrRes.body?.[0]?.count ?? '0') : '0', 10);

  if (total > 0) {
    console.log(`\n✅ Banco já tem ${total} usuário(s). Seed ignorado.`);
  } else {
    console.log('\n🌱 Inserindo dados iniciais...');

    // Usuários
    const perfis = {
      admin:  { units:true, news:true, users:true, sols:true, feeds:true, cfg:true, rel:true },
      gestor: { units:true, news:true, users:false, sols:true, feeds:false, cfg:false, rel:true },
      viewer: { units:false, news:false, users:false, sols:false, feeds:false, cfg:false, rel:false }
    };
    const seedUsers = [
      { nome:'Administrador', email:'admin@sema.ac.gov.br',  pwd:'admin123',  perfil:'admin'  },
      { nome:'Gestor SEMA',   email:'gestor@sema.ac.gov.br', pwd:'gestor123', perfil:'gestor' },
      { nome:'Visitante',     email:'viewer@sema.ac.gov.br', pwd:'viewer123', perfil:'viewer' }
    ];
    const usersPayload = seedUsers.map(u => {
      const salt = genSalt();
      return { nome: u.nome, email: u.email, pwd_hash: hashPwd(u.pwd, salt), pwd_salt: salt, perfil: u.perfil, permissoes: perfis[u.perfil] };
    });
    await seedTable('usuarios', usersPayload);
    console.log('   ✅ usuarios');

    // Unidades
    const unidades = [
      { tipo:'CIMA', nome:'CIMA Cruzeiro do Sul', municipio:'Cruzeiro do Sul', regional:'Vale do Juruá',     lat:-7.6408, lng:-72.6678, status:'ativo',       taxa_uso:78, quartos:10, salas:4, cozinha:true, auditorio:true },
      { tipo:'CIMA', nome:'CIMA Brasiléia',        municipio:'Brasiléia',       regional:'Alto Acre',         lat:-11.0053,lng:-68.7492, status:'ativo',       taxa_uso:31, quartos:8,  salas:3, cozinha:true, auditorio:false },
      { tipo:'CIMA', nome:'CIMA Feijó',            municipio:'Feijó',           regional:'Tarauacá/Envira',   lat:-8.1614, lng:-70.3539, status:'ativo',       taxa_uso:55, quartos:10, salas:4, cozinha:true, auditorio:true },
      { tipo:'CIMA', nome:'CIMA Rio Branco',       municipio:'Rio Branco',      regional:'Vale do Acre',      lat:-9.9754, lng:-67.8249, status:'ativo',       taxa_uso:88, quartos:15, salas:6, cozinha:true, auditorio:true },
      { tipo:'UGAI', nome:'UGAI Tarauacá',         municipio:'Tarauacá',        regional:'Tarauacá/Envira',   lat:-8.1608, lng:-70.7669, status:'ativo',       taxa_uso:62, quartos:8,  salas:3, cozinha:true, auditorio:false },
      { tipo:'UGAI', nome:'UGAI Sena Madureira',   municipio:'Sena Madureira',  regional:'Purus',             lat:-9.0658, lng:-68.6553, status:'manutencao',  taxa_uso:20, quartos:6,  salas:2, cozinha:true, auditorio:false },
      { tipo:'UGAI', nome:'UGAI Jordão',           municipio:'Jordão',          regional:'Tarauacá/Envira',   lat:-9.1653, lng:-71.8981, status:'ativo',       taxa_uso:45, quartos:6,  salas:2, cozinha:false,auditorio:false },
      { tipo:'UGAI', nome:'UGAI Mâncio Lima',      municipio:'Mâncio Lima',     regional:'Vale do Juruá',     lat:-7.6136, lng:-72.8994, status:'ativo',       taxa_uso:58, quartos:8,  salas:3, cozinha:true, auditorio:false }
    ];
    await seedTable('unidades', unidades);
    console.log('   ✅ unidades');

    // Notícias
    const hoje = new Date().toISOString().split('T')[0];
    const noticias = [
      { titulo:'SEMA amplia monitoramento no Vale do Juruá', resumo:'Novas estações de monitoramento foram instaladas na região do Juruá.', data:hoje, categoria:'Monitoramento', autor:'Assessoria SEMA', visivel:true, destaque:true },
      { titulo:'Fiscalização registra redução de 18% no desmatamento', resumo:'Dados do INPE confirmam tendência positiva no estado.', data:hoje, categoria:'Fiscalização', autor:'SEMA/AC', visivel:true, destaque:false },
      { titulo:'Programa REM Fase II apoia expansão das unidades', resumo:'Recursos garantem manutenção e expansão das unidades CIMA e UGAI.', data:hoje, categoria:'Programa REM', autor:'SEMA/AC', visivel:true, destaque:false }
    ];
    await seedTable('noticias', noticias);
    console.log('   ✅ noticias');

    // Feeds
    const feeds = [
      { nome:'Portal SEMA/AC', url:'https://sema.ac.gov.br/feed', ativo:true, categoria:'Oficial' },
      { nome:'INPE — Monitoramento Amazônia', url:'https://www.inpe.br/rss/feed.php', ativo:true, categoria:'Monitoramento' },
      { nome:'MMA — Ministério do Meio Ambiente', url:'https://www.gov.br/mma/feed', ativo:false, categoria:'Federal' }
    ];
    await seedTable('feeds', feeds);
    console.log('   ✅ feeds');

    // Configurações
    const cfgs = ['hero','alert','bloco','mapa','dash','acesso','news'].map(k => ({ chave: k, valor: true }));
    await seedTable('configuracoes', cfgs);
    console.log('   ✅ configuracoes');
  }

  console.log('\n🎉 Migração concluída com sucesso!\n');
  console.log('   Inicie o servidor: npm start');
  console.log(`   Acesse: http://localhost:${process.env.PORT || 3000}\n`);
}

main().catch(err => {
  console.error('\n💥 Erro fatal:', err.message || err);
  process.exit(1);
});
