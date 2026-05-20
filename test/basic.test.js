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
