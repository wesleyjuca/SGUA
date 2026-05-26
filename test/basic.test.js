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
