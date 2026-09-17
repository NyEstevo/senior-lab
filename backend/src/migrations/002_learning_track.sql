CREATE TABLE IF NOT EXISTS trilhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio TEXT NOT NULL CHECK (dominio IN ('backend', 'kubernetes')),
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_id UUID NOT NULL REFERENCES trilhas(id),
  nome TEXT NOT NULL,
  nivel SMALLINT NOT NULL CHECK (nivel BETWEEN 1 AND 5),
  ordem SMALLINT NOT NULL,
  objetivos_aprendizagem JSONB NOT NULL,
  conceitos_introduzidos JSONB NOT NULL,
  criterios_dominio JSONB NOT NULL,
  UNIQUE (trilha_id, ordem)
);

CREATE TABLE IF NOT EXISTS topico_pre_requisitos (
  topico_id UUID NOT NULL REFERENCES topicos(id),
  pre_requisito_id UUID NOT NULL REFERENCES topicos(id),
  PRIMARY KEY (topico_id, pre_requisito_id)
);

CREATE TABLE IF NOT EXISTS progresso_topico (
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  topico_id UUID NOT NULL REFERENCES topicos(id),
  status TEXT NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'concluido')),
  nivel_demonstrado SMALLINT CHECK (nivel_demonstrado BETWEEN 1 AND 5),
  tentativas SMALLINT NOT NULL DEFAULT 0,
  lacunas_identificadas JSONB NOT NULL DEFAULT '[]',
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, topico_id)
);

-- 'bloqueado' e 'disponivel' são calculados em runtime (sem pré-requisito
-- pendente concluído = nunca existiu tentativa), não persistidos: só gravamos
-- uma linha quando o aluno de fato inicia (em_andamento) ou conclui um tópico.

ALTER TABLE sessoes ALTER COLUMN cenario_id DROP NOT NULL;
ALTER TABLE sessoes ADD COLUMN IF NOT EXISTS topico_id UUID REFERENCES topicos(id);
ALTER TABLE sessoes ADD COLUMN IF NOT EXISTS tipo_sessao TEXT NOT NULL DEFAULT 'simulacao'
  CHECK (tipo_sessao IN ('aula', 'simulacao', 'revisao'));

ALTER TABLE cenarios ADD COLUMN IF NOT EXISTS topico_id UUID REFERENCES topicos(id);
