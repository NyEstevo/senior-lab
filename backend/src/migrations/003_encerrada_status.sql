-- 'encerrada' distingue "aluno clicou em Encerrar" (fim da sessão, sem garantia
-- de domínio) de 'completed' (o agente considerou os critérios demonstrados).
-- Isso também elimina o loop de custo de "Encerrar" repetido: a partir desta
-- migração, POST /sessions/:id/end finaliza a sessão numa única chamada,
-- sempre — nunca mais deixa a sessão 'active' esperando outra tentativa.
ALTER TABLE sessoes DROP CONSTRAINT sessoes_status_check;
ALTER TABLE sessoes ADD CONSTRAINT sessoes_status_check
  CHECK (status IN ('active', 'evaluating', 'completed', 'encerrada'));
