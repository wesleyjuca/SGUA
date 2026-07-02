# SGUA — Sistema de Gestão CIMA & UGAI

Sistema web da **SEMA/AC** (Secretaria de Estado do Meio Ambiente do Acre) para gestão das unidades ambientais **CIMA** e **UGAI**: unidades e ocupação, notícias e feeds RSS, solicitações de uso, denúncias ambientais, ocorrências, ordens de manutenção, agenda, inventário de equipamentos, documentos (LAI/transparência), indicadores e relatórios em PDF.

## Arquitetura

- **Backend**: Node.js 18+ com **Express** (`server.js`, monolito). Persistência em **PostgreSQL (Supabase)** via `pg`. Autenticação **JWT** (`jsonwebtoken` + `bcryptjs`). Segurança com `helmet` + `express-rate-limit`. Tarefas agendadas com `node-cron`. Uploads com `multer` (disco local ou Supabase Storage). Relatórios PDF com `pdfkit`. Logs com `pino`. Síntese opcional de notícias com o SDK da Anthropic.
- **Frontend**: SPA em **React 18 via CDN** (`React.createElement`, sem bundler/build) num único arquivo **`public/index.html`**, servido pelo **GitHub Pages** (workflow `.github/workflows/pages.yml`, diretório `public/`).
- **Persistência de estado do frontend**: além da API REST, o frontend lê/grava um "blob" de estado agregado na tabela `app_state` do Supabase.

> Observação: o frontend estático (GitHub Pages) e o backend (API) rodam em origens diferentes; o CORS é controlado por `ALLOWED_ORIGINS`.

## Estrutura de pastas

```text
server.js                 # backend Express (API REST + crons + bootstrap do schema)
public/
  index.html              # SPA React (arquivo canônico servido pelo GitHub Pages)
  manifest.json           # PWA
  sw.js                   # service worker (PWA)
test/
  basic.test.js           # suíte de testes (node:test)
scripts/
  gerar-pdfs.js           # gera os PDFs de docs/
docs/                     # manual de uso e roadmap (PDFs)
.github/workflows/
  ci.yml                  # lint/validação + testes
  pages.yml               # deploy do frontend (GitHub Pages)
render.yaml               # deploy do backend (Render)
.env.example              # variáveis de ambiente documentadas
```

## Modelo de dados (principais tabelas)

Tabelas centrais (assumidas pré-existentes no Supabase): `users`, `units`, `occupancy_records`, `news`, `requests`, `unit_photos`, `app_state`.

Tabelas criadas automaticamente no boot (`CREATE TABLE IF NOT EXISTS`): `sgua_admin_users` (login JWT), `sgua_feeds`, `sgua_feed_logs`, `sgua_ocorrencias`, `sgua_ordens`, `sgua_agenda`, `sgua_equipamentos`, `sgua_documentos`, `sgua_denuncias`, `sgua_audit_log`, `sgua_backups`, `sgua_reg_requests`, `sgua_notifications`, `sgua_suggestions`.

## Endpoints (visão geral)

- **Auth (JWT)**: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `*/api/auth/users`.
- **Domínio**: `/api/units` (+ ocupação/check-in/checkout), `/api/news`, `/api/requests`, `/api/feeds` (+ sync/scrape/autodiscover), `/api/ocorrencias`, `/api/ordens`, `/api/agenda`, `/api/equipamentos`, `/api/documentos`, `/api/denuncias`, `/api/notifications`, `/api/suggestions`, `/api/backup`, `/api/reg-requests`.
- **Relatórios/stats**: `/api/stats`, `/api/stats/ocupacao-historico`, `/api/audit`, `/api/relatorios/*` (PDF).
- **Utilitários**: `/api/health`, `/api/health/db`, `/api/config`, `/api/ai/status`, `/api/meta/model`.

Endpoints de escrita e dados sensíveis exigem `Authorization: Bearer <JWT>`.

## Execução local

```bash
npm install
# defina ao menos DATABASE_URL e JWT_SECRET (veja .env.example)
npm run dev      # usa --env-file=.env
# ou
npm start
```

O servidor sobe em `http://localhost:${PORT:-3000}` e serve o `public/index.html`. Na primeira execução, as tabelas `sgua_*` são criadas automaticamente e um usuário admin é semeado (veja abaixo).

### Testes

```bash
npm test         # node --test test/basic.test.js
```

## Configuração (variáveis de ambiente)

Veja **`.env.example`** para a lista completa. Principais:

- `DATABASE_URL` — string de conexão PostgreSQL do Supabase (obrigatória).
- `JWT_SECRET` — segredo de assinatura dos tokens (defina em produção; se ausente, é gerado um segredo volátil que invalida os tokens a cada restart).
- `ALLOWED_ORIGINS` — origens de CORS permitidas (padrão inclui `https://wesleyjuca.github.io`).
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — credenciais do admin semeado no primeiro boot (tabela `sgua_admin_users`). **Troque em produção.**
- Opcionais: `SMTP_*` (e-mail/alertas), `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` (síntese de notícias), `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (Storage), `ALERT_EMAIL`, `LOG_LEVEL`.

> **Segurança**: nunca comite segredos. O `.env.example` contém apenas placeholders — defina os valores reais no ambiente do provedor (Render) e no Supabase.

## Deploy

- **Backend (Render)**: `render.yaml` (build `npm install`, start `node server.js`, healthcheck `/api/health`). Configure as variáveis de ambiente no painel do Render.
- **Frontend (GitHub Pages)**: `.github/workflows/pages.yml` publica o diretório `public/` a cada push na `main`.

## Documentação

- `docs/manual-de-uso.pdf` — manual de uso.
- `docs/sugestoes-novas-funcionalidades.pdf` — roadmap de melhorias.
- Regenerar: `node scripts/gerar-pdfs.js`.
