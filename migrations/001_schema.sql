-- SGUA — Schema completo para Supabase (PostgreSQL)
-- Execute no Supabase SQL Editor: https://supabase.com/dashboard/project/vfcqgubduugncpjsgpqb/sql/new

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Usuários ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id          BIGSERIAL PRIMARY KEY,
  nome        TEXT        NOT NULL,
  email       TEXT        UNIQUE NOT NULL,
  pwd_hash    TEXT        NOT NULL,
  pwd_salt    TEXT        NOT NULL,
  perfil      TEXT        NOT NULL DEFAULT 'viewer' CHECK(perfil IN ('admin','gestor','viewer')),
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  permissoes  JSONB       NOT NULL DEFAULT '{}',
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Unidades ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unidades (
  id            BIGSERIAL   PRIMARY KEY,
  tipo          TEXT        NOT NULL CHECK(tipo IN ('CIMA','UGAI')),
  nome          TEXT        NOT NULL,
  municipio     TEXT        NOT NULL,
  regional      TEXT        NOT NULL DEFAULT '',
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  status        TEXT        NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo','manutencao','inativo')),
  taxa_uso      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(taxa_uso >= 0 AND taxa_uso <= 100),
  capacidade    INTEGER     NOT NULL DEFAULT 0,
  descricao     TEXT        NOT NULL DEFAULT '',
  historia      TEXT        NOT NULL DEFAULT '',
  decreto       TEXT        NOT NULL DEFAULT '',
  orgaos        JSONB       NOT NULL DEFAULT '[]',
  quartos       INTEGER     NOT NULL DEFAULT 0,
  salas         INTEGER     NOT NULL DEFAULT 0,
  cozinha       BOOLEAN     NOT NULL DEFAULT false,
  auditorio     BOOLEAN     NOT NULL DEFAULT false,
  visivel       BOOLEAN     NOT NULL DEFAULT true,
  foto          TEXT        NOT NULL DEFAULT '',
  galeria       JSONB       NOT NULL DEFAULT '[]',
  extras        JSONB       NOT NULL DEFAULT '[]',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Órgãos Presentes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orgaos_presentes (
  id           BIGSERIAL   PRIMARY KEY,
  unidade_id   BIGINT      NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  nome         TEXT        NOT NULL,
  tipo         TEXT        NOT NULL DEFAULT '',
  data_entrada DATE        NOT NULL DEFAULT CURRENT_DATE,
  data_saida   DATE,
  ativo        BOOLEAN     NOT NULL DEFAULT true
);

-- ─── Notícias ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS noticias (
  id         BIGSERIAL   PRIMARY KEY,
  titulo     TEXT        NOT NULL,
  resumo     TEXT        NOT NULL DEFAULT '',
  conteudo   TEXT        NOT NULL DEFAULT '',
  data       DATE        NOT NULL DEFAULT CURRENT_DATE,
  categoria  TEXT        NOT NULL DEFAULT '',
  unidade    TEXT        NOT NULL DEFAULT '',
  destaque   BOOLEAN     NOT NULL DEFAULT false,
  visivel    BOOLEAN     NOT NULL DEFAULT true,
  fonte      TEXT        NOT NULL DEFAULT '',
  autor      TEXT        NOT NULL DEFAULT '',
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Feeds RSS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feeds (
  id          BIGSERIAL   PRIMARY KEY,
  nome        TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  categoria   TEXT        NOT NULL DEFAULT '',
  ultimo_sync TIMESTAMPTZ
);

-- ─── Solicitações ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS solicitacoes (
  id           TEXT        PRIMARY KEY,
  solicitante  TEXT        NOT NULL,
  organizacao  TEXT        NOT NULL DEFAULT '',
  unidade      TEXT        NOT NULL,
  evento       TEXT        NOT NULL DEFAULT '',
  data_evento  DATE,
  status       TEXT        NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','aprovada','rejeitada')),
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Sessões (auth) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessoes (
  token       TEXT        PRIMARY KEY,
  usuario_id  BIGINT      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em   TIMESTAMPTZ NOT NULL
);

-- ─── Configurações ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL
);

-- ─── Índices de performance ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_unidades_tipo     ON unidades(tipo);
CREATE INDEX IF NOT EXISTS idx_unidades_status   ON unidades(status);
CREATE INDEX IF NOT EXISTS idx_unidades_municipio ON unidades(municipio);
CREATE INDEX IF NOT EXISTS idx_orgaos_unidade    ON orgaos_presentes(unidade_id);
CREATE INDEX IF NOT EXISTS idx_orgaos_ativo      ON orgaos_presentes(ativo);
CREATE INDEX IF NOT EXISTS idx_noticias_data     ON noticias(data DESC);
CREATE INDEX IF NOT EXISTS idx_noticias_visivel  ON noticias(visivel);
CREATE INDEX IF NOT EXISTS idx_sols_status       ON solicitacoes(status);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario   ON sessoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira    ON sessoes(expira_em);

-- ─── Trigger: atualiza atualizado_em em unidades ────────────────────────────
CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unidades_atualizado ON unidades;
CREATE TRIGGER trg_unidades_atualizado
  BEFORE UPDATE ON unidades
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- ─── RLS: desabilitado (service_role bypassa, auth gerenciada pelo app) ──────
ALTER TABLE usuarios          DISABLE ROW LEVEL SECURITY;
ALTER TABLE unidades          DISABLE ROW LEVEL SECURITY;
ALTER TABLE orgaos_presentes  DISABLE ROW LEVEL SECURITY;
ALTER TABLE noticias          DISABLE ROW LEVEL SECURITY;
ALTER TABLE feeds             DISABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes      DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes           DISABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes     DISABLE ROW LEVEL SECURITY;
