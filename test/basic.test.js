'use strict';
const {test} = require('node:test');
const assert = require('node:assert');
const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

test('server.js syntax valid', () => {
  assert.doesNotThrow(() => execSync('node --check ' + path.join(ROOT, 'server.js'), {cwd: ROOT}));
});

test('index.html JS syntax valid', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const js = src.slice(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));
  fs.writeFileSync('/tmp/sgua_test_check.js', js);
  assert.doesNotThrow(() => execSync('node --check /tmp/sgua_test_check.js'));
});

test('package.json valid JSON', () => {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')));
});

test('required env var documented in .env.example', () => {
  const ex = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  assert.ok(ex.includes('DATABASE_URL'));
});

test('health endpoint defined in server.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("/api/health'") || src.includes('"/api/health"'));
});

test('helmet required in server.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("require('helmet')"));
});

test('sanitizeHtml defined in index.html', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('function sanitizeHtml('));
});

test('GET /api/requests usa LEFT JOIN', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('LEFT JOIN units') || src.includes('LEFT JOIN units un'),
    'requests query deve usar LEFT JOIN para tolerar unidades deletadas');
});

test('feedAddedMap usa f.id como chave no UPDATE', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('feedAddedMap.get(f.id)'),
    'bulk sync deve rastrear contagem por f.id');
});

test('SkelNewsCard definido no frontend', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('SkelNewsCard'), 'skeleton loader de notícias deve existir');
});

test('Tip component definido no frontend', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('function Tip('), 'componente Tip de tooltip deve existir');
});

test('SMTP vars documentadas no .env.example', () => {
  const ex = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  assert.ok(ex.includes('SMTP_HOST') && ex.includes('SMTP_USER') && ex.includes('SMTP_PASS'),
    'variáveis SMTP devem estar no .env.example');
});

test('POST /api/feeds usa fetchSmartItems', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('fetchSmartItems(feedObj)'), 'validação de feed deve usar fetchSmartItems');
});

test('quantidade_diaria presente no schema feeds', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('quantidade_diaria'), 'coluna quantidade_diaria deve existir no schema feeds');
});

test('synthesizeArticle definida no server', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('function synthesizeArticle'), 'função synthesizeArticle deve estar definida');
});

test('POST /api/feeds/sync não referencia variável toInsert removida', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(!src.includes('items: toInsert'), 'resposta de /api/feeds/sync não deve usar toInsert indefinido');
});

test('desligamento gracioso registrado (SIGTERM/SIGINT)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("process.on('SIGTERM'") && src.includes("process.on('SIGINT'"),
    'handlers de desligamento gracioso devem existir');
});

test('handlers de erro de processo definidos', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("process.on('unhandledRejection'") && src.includes("process.on('uncaughtException'"),
    'handlers unhandledRejection e uncaughtException devem existir');
});

test('índices de banco criados no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('CREATE INDEX IF NOT EXISTS'), 'startup deve criar índices idempotentes');
});

test('CORS configurável via ALLOWED_ORIGINS', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('ALLOWED_ORIGINS'), 'origens CORS devem ser configuráveis por env');
});

test('alert() bloqueante substituído por notify() no frontend', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  // Apenas o fallback interno do helper notify() pode conter alert(
  const alertCount = (src.match(/alert\(/g) || []).length;
  assert.ok(src.includes('function notify('), 'helper notify() deve existir');
  assert.ok(alertCount <= 1, 'alert() só deve aparecer como fallback dentro de notify()');
});

test('POST /api/auth/login endpoint definido no server', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("'/api/auth/login'"), 'endpoint de login JWT deve existir');
});

test('requireAuth middleware definido no server', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('function requireAuth('), 'middleware requireAuth deve estar definido');
});

test('sgua_admin_users criado no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('sgua_admin_users'), 'tabela sgua_admin_users deve ser criada no startup');
});

test('apiFetch definido no frontend com suporte a JWT', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('function apiFetch('), 'helper apiFetch deve existir');
  assert.ok(src.includes('Authorization'), 'apiFetch deve enviar header Authorization');
});

test('manifest.json existe para PWA', () => {
  assert.doesNotThrow(() => {
    const data = fs.readFileSync(path.join(ROOT, 'public', 'manifest.json'), 'utf8');
    const manifest = JSON.parse(data);
    assert.ok(manifest.name && manifest.icons, 'manifest deve ter name e icons');
  });
});

test('service worker sw.js existe', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'public', 'sw.js')), 'sw.js deve existir');
});

test('JWT_SECRET documentado no .env.example', () => {
  const ex = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  assert.ok(ex.includes('JWT_SECRET'), 'JWT_SECRET deve estar documentado');
});

test('sgua_ocorrencias tabela definida no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('sgua_ocorrencias'), 'tabela sgua_ocorrencias deve ser criada no startup');
});

test('sgua_ordens tabela definida no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('sgua_ordens'), 'tabela sgua_ordens deve ser criada no startup');
});

test('sgua_audit_log tabela definida no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('sgua_audit_log'), 'tabela sgua_audit_log deve ser criada no startup');
});

test('auditLog helper definido no server', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('async function auditLog('), 'helper auditLog deve estar definido');
});

test('GET /api/stats endpoint definido', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("'/api/stats'"), 'endpoint /api/stats deve existir');
});

test('AdminOcorrencias componente definido no frontend', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('function AdminOcorrencias('), 'componente AdminOcorrencias deve existir');
});

test('sgua_agenda tabela definida no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('sgua_agenda'), 'tabela sgua_agenda deve ser criada no startup');
});

test('GET /api/agenda endpoint definido', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("'/api/agenda'"), 'endpoint /api/agenda deve existir');
});

test('GET /api/relatorios/ocupacao endpoint definido', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("'/api/relatorios/ocupacao'"), 'endpoint de relatório PDF de ocupação deve existir');
});

test('AdminAgenda componente definido no frontend', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('function AdminAgenda('), 'componente AdminAgenda deve existir');
});

test('sendAlertEmail helper definido no server', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('async function sendAlertEmail('), 'helper sendAlertEmail deve estar definido');
});

test('ALERT_EMAIL documentado no .env.example', () => {
  const ex = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  assert.ok(ex.includes('ALERT_EMAIL'), 'ALERT_EMAIL deve estar documentado');
});

test('pdfkit em dependencies (não apenas devDependencies)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies && pkg.dependencies.pdfkit, 'pdfkit deve estar em dependencies');
  assert.ok(!pkg.devDependencies || !pkg.devDependencies.pdfkit, 'pdfkit não deve estar em devDependencies');
});

test('sgua_equipamentos tabela definida no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('sgua_equipamentos'), 'tabela sgua_equipamentos deve ser criada no startup');
});

test('GET /api/equipamentos endpoint definido', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("'/api/equipamentos'"), 'endpoint GET /api/equipamentos deve existir');
});

test('sgua_documentos tabela definida no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('sgua_documentos'), 'tabela sgua_documentos deve ser criada no startup');
});

test('POST /api/documentos/upload endpoint definido', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("'/api/documentos/upload'"), 'endpoint POST /api/documentos/upload deve existir');
});

test('AdminEquipamentos componente definido no frontend', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('function AdminEquipamentos('), 'componente AdminEquipamentos deve existir');
});

test('AdminDocumentos componente definido no frontend', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('function AdminDocumentos('), 'componente AdminDocumentos deve existir');
});

test('cron RSS respeita frequencia semanal', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('isSaturday') && src.includes('getDay()'),
    'cron RSS deve verificar dia da semana para feeds semanais');
});

test('servidor não auto-cadastra feeds padrão no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(!src.includes('FDS_DEFAULTS'),
    'sistema deve iniciar sem feeds pré-cadastrados — feeds gerenciados exclusivamente pelo admin');
});

test('GET /api/feeds usa window function para logs (sem N+1)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('row_number() OVER (PARTITION BY feed_id'),
    'GET /api/feeds deve usar window function em vez de N+1 queries');
});

test('idx_sgua_feed_logs_feed_id index criado no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('idx_sgua_feed_logs_feed_id'),
    'índice de feed_logs deve ser criado no startup');
});

test('synthesizeArticle usa regex para extrair JSON', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('match(/\\{[\\s\\S]*\\}/)'),
    'synthesizeArticle deve usar regex para extrair JSON da resposta IA');
});

test('sgua_denuncias tabela definida no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('sgua_denuncias'), 'tabela sgua_denuncias deve ser criada no startup');
});

test('POST /api/denuncias endpoint público definido', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("'/api/denuncias'"), 'endpoint POST /api/denuncias deve existir');
});

test('GET /api/denuncias/consultar/:protocolo endpoint definido', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("'/api/denuncias/consultar/:protocolo'"), 'endpoint de consulta por protocolo deve existir');
});

test('AdminDenuncias componente definido no frontend', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('function AdminDenuncias('), 'componente AdminDenuncias deve existir');
});

test('GET /api/relatorios/equipamentos endpoint definido', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("'/api/relatorios/equipamentos'"), 'endpoint de relatório PDF de equipamentos deve existir');
});

test('sgua_backups tabela definida no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('sgua_backups'), 'tabela sgua_backups deve ser criada no startup');
});

test('sgua_reg_requests tabela definida no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('sgua_reg_requests'), 'tabela sgua_reg_requests deve ser criada no startup');
});

test('sgua_notifications tabela definida no startup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('sgua_notifications'), 'tabela sgua_notifications deve ser criada no startup');
});

test('GET /api/documentos valida JWT corretamente', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('jwt.verify(req.headers.authorization.replace'),
    'GET /api/documentos deve verificar JWT, não apenas existência do header');
});

test('inserirArtigo salva data_pub e fonte nas notícias', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('data_pub,fonte') && src.includes('item.date'),
    'inserirArtigo deve salvar data de publicação e nome da fonte no banco');
});

test('PgDenuncias componente definido no frontend', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('function PgDenuncias('), 'componente público PgDenuncias deve existir');
});

test('undici é carregado opcionalmente para suporte a certs gov.br', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes("require('undici')") && src.includes('rejectUnauthorized: false'),
    'undici deve ser carregado opcionalmente para permitir feeds gov.br com certificados auto-assinados');
});

test('User-Agent de feeds usa formato compatível com servidores externos', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('Mozilla/5.0') && src.includes('SGUA-RSS-Bot'),
    'User-Agent do feed deve usar formato Mozilla para evitar bloqueios HTTP 403');
});

test('frontend FDS começa vazio (sem feeds pré-cadastrados)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('var FDS=[];'), 'array FDS do frontend deve ser vazio — feeds vêm do servidor');
});

test('PageUnidade redesenhado com abas Equipamentos Documentos Ocorrencias', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('"equipamentos","Equipamentos"') && src.includes('"documentos","Documentos"') && src.includes('"ocorrencias","Ocorrências"'),
    'PageUnidade deve ter abas Equipamentos, Documentos e Ocorrências');
});

test('PgIndicadores integra /api/stats/ocupacao-historico', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('/api/stats/ocupacao-historico'),
    'PgIndicadores deve buscar série histórica de ocupação');
});

test('PgIndicadores tem 3 abas consolidadas', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes("'resumo'")&&src.includes("'graficos'")&&src.includes("'relatorios'")&&!src.includes("'solicitacoes'")&&!src.includes("'visao'"),
    'PgIndicadores deve ter exatamente 3 abas: resumo, graficos, relatorios');
});

test('doExport aplica período no título do relatório PDF', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.ok(src.includes('Período:')&&src.includes('dtStart')&&src.includes('dtEnd'),
    'doExport deve incluir período (dtStart/dtEnd) no título do PDF quando informado');
});

test('POST /api/feeds responde imediatamente sem aguardar validação', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  // Deve usar setImmediate para validação async e não ter await fetchSmartItems antes do res.json
  assert.ok(src.includes('setImmediate') && src.includes('validacao: null'),
    'POST /api/feeds deve salvar imediatamente e validar em background via setImmediate');
});

test('POST /api/feeds/scrape respeita timeout de 12s', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(src.includes('Promise.race') && src.includes('12000'),
    'POST /api/feeds/scrape deve usar Promise.race com timeout de 12s');
});
