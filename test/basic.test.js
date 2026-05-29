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
