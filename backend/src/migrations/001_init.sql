CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio TEXT NOT NULL CHECK (dominio IN ('backend', 'kubernetes')),
  modo TEXT NOT NULL CHECK (modo IN ('incidente', 'code_review', 'arquitetura')),
  variaveis JSONB NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cenarios_dominio_modo ON cenarios (dominio, modo);

CREATE TABLE IF NOT EXISTS sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  cenario_id UUID NOT NULL REFERENCES cenarios(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'evaluating', 'completed')),
  system_prompt TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes (usuario_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id UUID NOT NULL REFERENCES sessoes(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  conteudo TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mensagens_sessao ON mensagens (sessao_id, criado_em);

CREATE TABLE IF NOT EXISTS avaliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id UUID NOT NULL UNIQUE REFERENCES sessoes(id),
  conteudo TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
