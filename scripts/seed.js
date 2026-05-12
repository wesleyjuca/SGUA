'use strict';
require('dotenv').config();
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ .env: SUPABASE_URL e SUPABASE_KEY ausentes');
  process.exit(1);
}

function genSalt() { return crypto.randomBytes(16).toString('hex'); }
function hashPwd(pwd, salt) { return crypto.pbkdf2Sync(pwd, salt, 100_000, 32, 'sha256').toString('hex'); }
const today = () => new Date().toISOString().split('T')[0];

async function api(method, table, body, extra = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${extra}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal,resolution=ignore-duplicates'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok && r.status !== 409) {
    const txt = await r.text();
    throw new Error(`${table} ${method} ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.status;
}

async function count(table) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact' }
  });
  return parseInt(r.headers.get('content-range')?.split('/')[1] || '0', 10);
}

async function main() {
  console.log('\n🌱 SGUA — Inserindo dados iniciais via Supabase REST API\n');

  // Verificar tabelas
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/usuarios?limit=0`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    }).then(r => { if (!r.ok) throw new Error('Tabela usuarios não existe'); });
  } catch (e) {
    console.error('❌ Tabelas não encontradas. Execute primeiro o SQL em:');
    console.error(`   https://supabase.com/dashboard/project/vfcqgubduugncpjsgpqb/sql/new\n`);
    process.exit(1);
  }

  const nUsers = await count('usuarios');
  if (nUsers > 0) {
    console.log(`✅ ${nUsers} usuário(s) já existem. Seed ignorado.\n`);
    return;
  }

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
  for (const u of seedUsers) {
    const salt = genSalt();
    await api('POST', 'usuarios', { nome:u.nome, email:u.email, pwd_hash:hashPwd(u.pwd,salt), pwd_salt:salt, perfil:u.perfil, ativo:true, permissoes:perfis[u.perfil] });
  }
  console.log('✅ usuarios');

  // Unidades
  const unidades = [
    { tipo:'CIMA', nome:'CIMA Cruzeiro do Sul', municipio:'Cruzeiro do Sul', regional:'Vale do Juruá',     lat:-7.6408, lng:-72.6678, status:'ativo',      taxa_uso:78, quartos:10, salas:4, cozinha:true, auditorio:true  },
    { tipo:'CIMA', nome:'CIMA Brasiléia',        municipio:'Brasiléia',       regional:'Alto Acre',         lat:-11.0053,lng:-68.7492, status:'ativo',      taxa_uso:31, quartos:8,  salas:3, cozinha:true, auditorio:false },
    { tipo:'CIMA', nome:'CIMA Feijó',            municipio:'Feijó',           regional:'Tarauacá/Envira',   lat:-8.1614, lng:-70.3539, status:'ativo',      taxa_uso:55, quartos:10, salas:4, cozinha:true, auditorio:true  },
    { tipo:'CIMA', nome:'CIMA Rio Branco',       municipio:'Rio Branco',      regional:'Vale do Acre',      lat:-9.9754, lng:-67.8249, status:'ativo',      taxa_uso:88, quartos:15, salas:6, cozinha:true, auditorio:true  },
    { tipo:'UGAI', nome:'UGAI Tarauacá',         municipio:'Tarauacá',        regional:'Tarauacá/Envira',   lat:-8.1608, lng:-70.7669, status:'ativo',      taxa_uso:62, quartos:8,  salas:3, cozinha:true, auditorio:false },
    { tipo:'UGAI', nome:'UGAI Sena Madureira',   municipio:'Sena Madureira',  regional:'Purus',             lat:-9.0658, lng:-68.6553, status:'manutencao', taxa_uso:20, quartos:6,  salas:2, cozinha:true, auditorio:false },
    { tipo:'UGAI', nome:'UGAI Jordão',           municipio:'Jordão',          regional:'Tarauacá/Envira',   lat:-9.1653, lng:-71.8981, status:'ativo',      taxa_uso:45, quartos:6,  salas:2, cozinha:false,auditorio:false },
    { tipo:'UGAI', nome:'UGAI Mâncio Lima',      municipio:'Mâncio Lima',     regional:'Vale do Juruá',     lat:-7.6136, lng:-72.8994, status:'ativo',      taxa_uso:58, quartos:8,  salas:3, cozinha:true, auditorio:false }
  ];
  for (const u of unidades) await api('POST', 'unidades', u);
  console.log('✅ unidades');

  // Notícias
  const noticias = [
    { titulo:'SEMA amplia monitoramento no Vale do Juruá', resumo:'Novas estações instaladas.', data:today(), categoria:'Monitoramento', autor:'Assessoria SEMA', visivel:true, destaque:true },
    { titulo:'Fiscalização registra redução de 18% no desmatamento', resumo:'Dados do INPE confirmam tendência positiva.', data:today(), categoria:'Fiscalização', autor:'SEMA/AC', visivel:true, destaque:false },
    { titulo:'Programa REM Fase II apoia expansão das unidades', resumo:'Recursos garantem manutenção.', data:today(), categoria:'Programa REM', autor:'SEMA/AC', visivel:true, destaque:false }
  ];
  for (const n of noticias) await api('POST', 'noticias', n);
  console.log('✅ noticias');

  // Feeds
  const feeds = [
    { nome:'Portal SEMA/AC', url:'https://sema.ac.gov.br/feed', ativo:true, categoria:'Oficial' },
    { nome:'INPE — Monitoramento Amazônia', url:'https://www.inpe.br/rss/feed.php', ativo:true, categoria:'Monitoramento' },
    { nome:'MMA — Ministério do Meio Ambiente', url:'https://www.gov.br/mma/feed', ativo:false, categoria:'Federal' }
  ];
  for (const f of feeds) await api('POST', 'feeds', f);
  console.log('✅ feeds');

  // Configurações
  const cfgs = ['hero','alert','bloco','mapa','dash','acesso','news'].map(k => ({ chave:k, valor:true }));
  await api('POST', 'configuracoes', cfgs);
  console.log('✅ configuracoes');

  console.log('\n🎉 Seed concluído!\n   Inicie o servidor: npm start\n');
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1); });
