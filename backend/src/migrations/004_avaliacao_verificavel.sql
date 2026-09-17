-- A avaliação de incidente passa a ter um veredito estruturado, gravado ao lado
-- da causa raiz que o cenário definia. Isso torna a avaliação auditável: para
-- cada sessão fica registrado o que o servidor sabia (causa_raiz_esperada), o
-- que o aluno concluiu (hipotese_final) e o veredito do agente
-- (causa_raiz_encontrada) — sem depender de reler o texto livre da avaliação.
-- Colunas nulas para sessões de code_review/arquitetura e avaliações antigas.
ALTER TABLE avaliacoes ADD COLUMN IF NOT EXISTS causa_raiz_esperada TEXT;
ALTER TABLE avaliacoes ADD COLUMN IF NOT EXISTS causa_raiz_encontrada BOOLEAN;
ALTER TABLE avaliacoes ADD COLUMN IF NOT EXISTS hipotese_final TEXT;
