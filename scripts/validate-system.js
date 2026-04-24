const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3101;
const DB_FILE = path.join(__dirname, '..', 'data', 'sgua.validation.db');
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch (_error) {
      // ignore while waiting startup
    }
    await sleep(300);
  }
  throw new Error('Servidor não ficou saudável dentro do tempo esperado.');
}

async function api(method, endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} -> HTTP ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function runValidation() {
  if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), SGUA_DB_PATH: DB_FILE },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  server.stderr.on('data', (chunk) => process.stderr.write(`[server:err] ${chunk}`));

  try {
    await waitForHealth();

    const usersInitial = await api('GET', '/api/users');
    const admin = usersInitial.data.find((u) => u.email === 'admin@sema.ac.gov.br');
    if (!admin) throw new Error('Usuário admin não inicializado no banco.');

    const createdUser = await api('POST', '/api/users', {
      name: 'Usuário QA',
      email: 'qa@example.com',
      role: 'manager'
    });

    await api('PUT', `/api/users/${createdUser.data.id}`, {
      role: 'viewer',
      name: 'Usuário QA Atualizado',
      email: 'qa.updated@example.com'
    });

    const createdUnit = await api('POST', '/api/units', {
      name: 'Unidade Integração',
      address: 'Rua Teste, 100',
      latitude: -9.97,
      longitude: -67.81,
      capacity: 3
    });

    await api('PUT', `/api/units/${createdUnit.data.id}`, {
      status: 'active',
      capacity: 5
    });

    await api('POST', `/api/units/${createdUnit.data.id}/occupancy`, {
      organization_name: 'Associação Teste',
      usage_type: 'Evento',
      user_id: createdUser.data.id
    });

    const occupancy = await api('GET', `/api/units/${createdUnit.data.id}/occupancy`);
    if (!occupancy.data.length) throw new Error('Registro de ocupação não foi persistido.');

    await api('PUT', `/api/occupancy/${occupancy.data[0].id}/checkout`, {});

    const news = await api('POST', '/api/news', {
      title: 'Notícia de Integração',
      content: 'Fluxo integrado com banco validado.',
      author_id: createdUser.data.id
    });

    await api('PUT', `/api/news/${news.data.id}`, {
      title: 'Notícia Atualizada',
      content: 'Conteúdo ajustado para validação completa.'
    });

    const createdRequest = await api('POST', '/api/requests', {
      unit_id: createdUnit.data.id,
      requester_name: 'Solicitante QA',
      requester_email: 'solicitante@example.com',
      usage_type: 'Reunião',
      notes: 'Solicitação de teste de integração.'
    });

    await api('PUT', `/api/requests/${createdRequest.data.id}`, {
      status: 'approved',
      notes: 'Aprovada durante validação automatizada.',
      unit_id: createdUnit.data.id
    });

    await api('DELETE', `/api/requests/${createdRequest.data.id}`);
    await api('DELETE', `/api/news/${news.data.id}`);
    await api('DELETE', `/api/users/${createdUser.data.id}`);
    await api('DELETE', `/api/units/${createdUnit.data.id}`);

    await api('GET', '/api/meta/model');
    await api('GET', '/api/health');

    console.log('\n✅ Validação completa: todas as rotas principais responderam e persistiram no SQLite.');
  } finally {
    if (!server.killed) {
      server.kill('SIGTERM');
      await sleep(200);
    }
  }
}

runValidation().catch((error) => {
  console.error('\n❌ Falha na validação do sistema:', error.message);
  process.exitCode = 1;
});
