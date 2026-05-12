# SGUA — Sistema de Gestão CIMA & UGAI

Aplicação full-stack com **Node.js + Express + SQLite + frontend modular em ES Modules**.

## O que foi reestruturado

- Backend reorganizado em API REST com validações, tratamento centralizado de erros e rotas por domínio.
- Frontend dividido em módulos independentes:
  - Dashboard
  - Unidades
  - Mapa
  - Usuários
  - Notícias
  - Solicitações
- Persistência em SQLite com modelagem relacional e chaves estrangeiras.

## Modelagem de banco de dados

### Entidades

- `users`: usuários do sistema.
- `units`: unidades físicas/operacionais.
- `occupancy_records`: registros de uso/ocupação por unidade.
- `news`: notícias comunicadas no sistema.
- `requests`: solicitações de uso.

### Relacionamentos

- `occupancy_records.unit_id -> units.id`
- `occupancy_records.user_id -> users.id`
- `news.author_id -> users.id`
- `requests.unit_id -> units.id`

## Endpoints principais (CRUD)

- `GET/POST/PUT/DELETE /api/users`
- `GET/POST/PUT/DELETE /api/units`
- `GET /api/units/:id/occupancy`
- `POST /api/units/:id/occupancy`
- `PUT /api/occupancy/:id/checkout`
- `GET/POST/PUT/DELETE /api/news`
- `GET/POST/PUT/DELETE /api/requests`
- `GET /api/meta/model` (documentação de entidades e relacionamentos)
- `GET /api/health`

## Execução

```bash
npm install
npm start
```

Acesse: `http://localhost:3000`.

## Validação automatizada (API + banco SQLite)

```bash
npm run validate:system
```

Esse comando sobe o servidor em porta temporária, cria um banco isolado e valida operações de CRUD + fluxos de ocupação com persistência real.

## Publicação (produção)

- Defina variáveis de ambiente:
  - `PORT` (ex.: `3000`)
  - `SGUA_DB_PATH` (ex.: `/var/lib/sgua/sgua.db`)
- Inicie com:

```bash
npm ci --omit=dev
npm start
```

- Exponha a aplicação atrás de um proxy (Nginx/Caddy) e mantenha o diretório do SQLite em volume persistente.

## Estrutura de pastas

```text
server.js
public/
  index.html
  styles.css
  js/
    app.js
    api.js
    modules/
      dashboard.js
      map.js
      news.js
      requests.js
      units.js
      users.js
data/
  sgua.db
```

## Observações

- O sistema agora está preparado para evolução incremental com páginas/módulos desacoplados.
- O banco é criado automaticamente na primeira execução.
