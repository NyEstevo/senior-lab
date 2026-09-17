# Plano: Agente do SeniorLab passa a ensinar trilha progressiva + calibrar simulações por nível

**Status: Aprovado — Fatias 0–3 (MVP) implementadas em 2026-09-15**

Verificado end-to-end (aula → fechamento estruturado → progresso → menu → simulação
calibrada por nível → bloqueio de pré-requisito) via curl contra o stack local em
`docker compose`. Fatia 4 (regressão de nível, expansão L3–L5, domínio `backend`,
rubrica estruturada de avaliação) segue como trabalho futuro, fora deste MVP.

Projeto alvo: `/home/ALINE.ESTEVO/personal/senior-lab` (backend Node/TS + Postgres + frontend React).
Este documento não altera código — é o contrato a ser aprovado antes de qualquer implementação.

---

## Contexto

Hoje o SeniorLab só simula (incidente, code review, decisão de arquitetura) — o aluno escolhe domínio e modo, recebe um cenário sorteado aleatoriamente entre 6 fixos, conversa até um teto de turnos e recebe uma avaliação final em texto livre. Não existe conceito de nível, progresso, trilha de conteúdo ou ensino: a sessão é terminal (`status: completed`) e não leva a lugar nenhum.

O pedido é transformar o agente em condutor de uma trilha de aprendizado (ex.: Kubernetes do iniciante ao especialista), que ensina o tópico antes de simular, e que calibra a dificuldade do cenário pelo nível do aluno *naquele tópico específico* — nunca pelo nível geral dele, e nunca exigindo conceito ainda não ensinado. Ao fim de cada tópico, o agente deve sempre oferecer um menu de modos (simular, revisar, aprofundar, avançar), com bloqueios explícitos por pré-requisito.

Decisões de escopo já confirmadas com a usuária (não são mais "em aberto"):
- **Calibração dinâmica via prompt**: sem explosão de seeds por nível; o system prompt recebe parâmetros de calibração (nº de componentes, red herrings, ambiguidade etc.) e o LLM adapta a simulação em tempo real.
- **Conteúdo didático gerado on-the-fly**: o tópico só guarda metadados estruturados (objetivos, conceitos, critérios de domínio); o texto de explicação/exemplo não fica fixo em banco — o agente ensina a partir dos metadados.
- **MVP da demo de 5 min**: uma trilha completa (Kubernetes) fim a fim, com poucos tópicos, cobrindo o fluxo inteiro (aula → checagem → menu → simulação calibrada → avaliação → progresso), antes de expandir para `backend`.

---

## 1. Diagnóstico — o que muda e por quê

| Arquivo | Hoje | Precisa mudar porque |
|---|---|---|
| `backend/src/migrations/001_init.sql` | 5 tabelas flat: `usuarios`, `cenarios`, `sessoes`, `mensagens`, `avaliacoes`. Sem nível/progresso. | Precisa de hierarquia de conteúdo (trilha→módulo→tópico) e estado de progresso por (usuário, tópico). Nova migração `002_learning_track.sql`, aditiva — nunca reescrever a 001. |
| `backend/src/types.ts` | `Modo`, `Dominio`, `StatusSessao`, `TETO_TURNOS`. Sem `Nivel`, sem `TipoSessao`. | Precisa expressar nível (L1–L5), tipo de sessão (`aula`\|`simulacao`\|`revisao`) e o payload de calibração. |
| `backend/src/prompts/{incidente,code-review,arquitetura}.txt` | Prompts estáticos, sem placeholder de nível/calibração. Regra fixa "guarde a causa raiz" já é reaproveitável tal e qual. | Precisam de um bloco novo de "CALIBRAÇÃO DE COMPLEXIDADE" injetado por `{{...}}`, preenchido a partir da tabela L1–L5 (seção 4). O corpo pedagógico (regras de comportamento) se mantém — é o parâmetro de dificuldade que passa a variar. |
| `backend/src/agent/prompt.ts` | `buildSystemPrompt(modo, variaveis)` monta 1 prompt por modo via regex `{{chave}}`. | Precisa de uma função irmã, `buildAulaPrompt(topico, nivelAluno)`, e de `buildSystemPrompt` ganhando os novos placeholders de calibração vindos da tabela L1–L5. Mecanismo de substituição (regex `{{\w+}}`) é reaproveitado sem mudança. |
| `backend/src/routes/sessions.ts` | `POST /sessions` sorteia cenário aleatório por `(dominio, modo)`, sem nível. `POST /sessions/:id/end` só grava avaliação em texto livre e marca `completed` — sem atualizar progresso nem oferecer próximo passo. | Precisa: (a) endpoint de trilha/tópicos, (b) `POST /sessions` aceitando `topicoId` e resolvendo nível vigente do aluno naquele tópico, (c) `POST /sessions/:id/end` estruturando a avaliação (score/lacunas) e atualizando `progresso_topico`, (d) endpoint de menu pós-tópico. |
| `frontend/src/App.tsx`, `frontend/src/api.ts` | Telas `setup\|chat\|avaliacao\|historico`. Sem trilha, sem menu de modos, sem indicação de nível/progresso. | Precisa de tela de trilha (lista de tópicos com estado bloqueado/disponível/concluído), tela de aula, e o menu de modos ao fechar tópico. |
| `backend/src/seed/data.ts` | 6 cenários fixos, sem `nivel` nem vínculo a tópico. | Precisa de seed de trilha Kubernetes (tópicos L1–L5) + vincular os cenários existentes de `kubernetes` a tópicos como cenário-base reaproveitável em qualquer nível (a calibração é applied via prompt, não via novo cenário). |

Constatação importante do diagnóstico: **a máquina de estados hoje vive dentro do texto do prompt, não em código** (o próprio `.txt` instrui "após 15 turnos, entre em modo avaliação"). Isso deve ser preservado como padrão arquitetural — a nova etapa de "aula" também deve ser conduzida assim (1 system prompt textual, o código só decide *qual* prompt e com que parâmetros montar), em vez de introduzir uma orquestração rígida em TypeScript. É mais barato e consistente com o que já existe.

---

## 2. Esquema de dados — nova migração `002_learning_track.sql`

```sql
CREATE TABLE trilhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio TEXT NOT NULL CHECK (dominio IN ('backend', 'kubernetes')),
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL
);

CREATE TABLE topicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_id UUID NOT NULL REFERENCES trilhas(id),
  nome TEXT NOT NULL,
  nivel SMALLINT NOT NULL CHECK (nivel BETWEEN 1 AND 5),
  ordem SMALLINT NOT NULL,
  objetivos_aprendizagem JSONB NOT NULL,     -- string[]
  conceitos_introduzidos JSONB NOT NULL,     -- string[]
  criterios_dominio JSONB NOT NULL,          -- string[] (o que precisa demonstrar p/ concluir)
  UNIQUE (trilha_id, ordem)
);

CREATE TABLE topico_pre_requisitos (
  topico_id UUID NOT NULL REFERENCES topicos(id),
  pre_requisito_id UUID NOT NULL REFERENCES topicos(id),
  PRIMARY KEY (topico_id, pre_requisito_id)
);

CREATE TABLE progresso_topico (
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  topico_id UUID NOT NULL REFERENCES topicos(id),
  status TEXT NOT NULL DEFAULT 'bloqueado'
    CHECK (status IN ('bloqueado', 'disponivel', 'em_andamento', 'concluido')),
  nivel_demonstrado SMALLINT CHECK (nivel_demonstrado BETWEEN 1 AND 5),
  tentativas SMALLINT NOT NULL DEFAULT 0,
  lacunas_identificadas JSONB NOT NULL DEFAULT '[]',
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, topico_id)
);

-- sessoes ganha vínculo opcional a tópico e um tipo
ALTER TABLE sessoes ADD COLUMN topico_id UUID REFERENCES topicos(id);
ALTER TABLE sessoes ADD COLUMN tipo_sessao TEXT NOT NULL DEFAULT 'simulacao'
  CHECK (tipo_sessao IN ('aula', 'simulacao', 'revisao'));

-- cenarios passam a poder ser vinculados a um tópico (reaproveitáveis entre níveis)
ALTER TABLE cenarios ADD COLUMN topico_id UUID REFERENCES topicos(id);
```

**Exemplo preenchido — Kubernetes:**

| ordem | nível | tópico | objetivos_aprendizagem (resumo) | conceitos_introduzidos | pré-requisitos |
|---|---|---|---|---|---|
| 1 | L1 | Pods & Deployments | criar/inspecionar pod, entender ciclo de vida | Pod, Deployment, ReplicaSet | — |
| 2 | L1 | Services & Networking básico | expor um Deployment, tipos de Service | Service (ClusterIP/NodePort), DNS interno | Pods & Deployments |
| 3 | L2 | ConfigMaps & Secrets | separar config de imagem, montar como env/volume | ConfigMap, Secret, volumeMounts | Services & Networking básico |
| 4 | L2 | Probes & Resource limits | liveness/readiness, requests/limits | Probes, QoS classes | ConfigMaps & Secrets |
| 5 | L3 | Autoscaling & Scheduling | HPA, afinidade/antiafinidade, taints/tolerations | HPA, node affinity, taints | Probes & Resource limits |
| 6 | L4 | Troubleshooting multi-serviço | correlacionar sintomas entre serviços dependentes | Cascading failures, circuit breaking | Autoscaling & Scheduling |
| 7 | L5 | Operators & multi-cluster | CRDs, controllers, federação/multi-cluster | Operator pattern, control plane troubleshooting | Troubleshooting multi-serviço |

MVP da demo cobre 1–3 (L1 e L2).

---

## 3. Máquina de estados da sessão

A orquestração continua majoritariamente dentro do texto do system prompt (como hoje), com o backend decidindo apenas *qual* prompt montar e gravando o resultado no `progresso_topico`. Fluxo:

```
[Aluno abre trilha]
        │
        ▼
GET /api/trilhas/:id/topicos  → cada tópico com status calculado
 (bloqueado | disponivel | em_andamento | concluido)
        │ aluno escolhe tópico "disponivel"
        ▼
POST /api/sessions {tipo_sessao: "aula", topicoId}
   → buildAulaPrompt(topico) monta prompt único:
     Explicação → exemplo concreto → checagem de entendimento → correção de lacunas
        │
        │  (mesma sessão, turnos normais via POST /sessions/:id/turns)
        ▼
   agente decide, dentro do próprio prompt, quando os critérios_dominio
   foram demonstrados → emite marcador de fechamento na resposta
   (ex.: bloco "[FECHAMENTO_TOPICO]" parseável pelo backend)
        │
        ▼
POST /sessions/:id/end (tipo_sessao = aula)
   → backend interpreta o marcador, grava progresso_topico
     (status=concluido, nivel_demonstrado, lacunas_identificadas)
   → resposta inclui `proximosModos` (ver R3/seção 4) já filtrados
     por pré-requisito
        │
        ▼
[Menu de modos exibido no frontend]
  ├─ Simulação de incidente/code review/arquitetura → POST /sessions
  │     {tipo_sessao: "simulacao", modo, topicoId}
  │     nível de calibração = nivel_demonstrado em progresso_topico
  │     (nunca nível geral do aluno)
  ├─ Quiz/revisão rápida → POST /sessions {tipo_sessao: "revisao", topicoId}
  ├─ Aprofundar no tópico atual → reabre "aula" no mesmo tópico
  └─ Avançar para o próximo tópico → volta ao topo do fluxo,
     próximo tópico agora com status "disponivel"
```

Encerramento de simulação (`tipo_sessao: simulacao`) segue exatamente como hoje (`INSTRUCAO_ENCERRAMENTO`, avaliação em modo mentor), só que a avaliação final passa a também gravar `progresso_topico.tentativas += 1` e possivelmente rebaixar `nivel_demonstrado` (ver regressão, seção 7).

---

## 4. Tabela de calibração L1–L5

Parâmetros observáveis injetados no system prompt de simulação via novos placeholders (`{{n_componentes}}`, `{{n_red_herrings}}`, etc.), preenchidos por uma função pura `calibracaoParaNivel(nivel: 1|2|3|4|5)` — sem tocar nos 3 `.txt` de personalidade/regras que já existem.

| Parâmetro | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| nº de componentes/serviços envolvidos | 1 | 1–2 | 2–3 | 3–4 | 4+ |
| nº de red herrings | 0 | 0–1 | 1–2 | 2–3 | 3+ |
| ambiguidade do enunciado | totalmente explícito | quase explícito | parcialmente aberto | aberto, exige hipótese | aberto, múltiplas causas plausíveis |
| profundidade de root cause exigida | sintoma = causa | 1 salto (sintoma→causa direta) | 2 saltos (causa intermediária) | causa sistêmica (config+infra) | causa sistêmica multi-camada |
| autonomia esperada / dica proativa do "sênior" | dica após 2 turnos parados | dica após 3 turnos | dica só se pedida | sem dica, só confirma perguntas | sem dica, questiona de volta |
| pressão de tempo / ruído | nenhum stakeholder, logs limpos | 1 stakeholder calmo | 1–2 stakeholders, logs com 1 fonte irrelevante | múltiplos stakeholders, logs ruidosos | crise multi-stakeholder, ruído alto |

Regra dura (R4): `calibracaoParaNivel` nunca pode referenciar `conceitos_introduzidos` de um tópico com `ordem` maior que o tópico atual do aluno — isso é reforçado no próprio texto do prompt ("só use conceitos ensinados até aqui: {{conceitos_disponiveis}}"), não apenas na tabela.

---

## 5. Diff conceitual das regras do agente

**Novo arquivo** `backend/src/prompts/aula.txt` (mesmo padrão dos 3 existentes — texto + placeholders `{{...}}`):
- Abertura: contextualiza o tópico (`{{topico_nome}}`, `{{objetivos}}`).
- Corpo: Explicação → exemplo concreto → pergunta de checagem → se errar, corrige a lacuna específica (não repete a explicação inteira) → repete checagem até os `{{criterios_dominio}}` serem demonstrados.
- Fechamento: emite bloco parseável `[FECHAMENTO_TOPICO nivel_demonstrado=N lacunas="..."]` — análogo ao bloco de avaliação que os prompts de simulação já emitem em texto livre, só que estruturado para o backend conseguir gravar em `progresso_topico` sem parsing frágil de linguagem natural.

**Diff nos 3 prompts de simulação existentes** (`incidente.txt`, `code-review.txt`, `arquitetura.txt`): adicionar um bloco novo logo após "CONTEXTO DO INCIDENTE" / equivalente:

```diff
 CONTEXTO DO INCIDENTE:
 - Domínio: {{domain}}
 - Sintoma inicial: {{symptom}}
 ...
+CALIBRAÇÃO DE COMPLEXIDADE (nível {{nivel}} no tópico {{topico_nome}}):
+- Componentes envolvidos: {{n_componentes}}
+- Red herrings a incluir: {{n_red_herrings}}
+- Ambiguidade do enunciado: {{ambiguidade}}
+- Profundidade de causa raiz exigida: {{profundidade_causa}}
+- Proatividade de dica: {{autonomia}}
+- Ruído/pressão: {{ruido}}
+- REGRA DURA: use apenas conceitos já ensinados neste tópico ou anteriores
+  ({{conceitos_disponiveis}}). Nunca exija conceito de nível superior.
```

O restante do prompt (regras de comportamento, tom, avaliação final) **não muda** — a calibração é aditiva.

---

## 6. Casos de teste de aceite

1. Aluno L1 em "Pods & Deployments" conclui a aula → menu mostra "Simulação de incidente" disponível, calibrada para 1 componente e 0 red herrings; "Aprofundar no tópico atual" sempre disponível; "Avançar" leva a "Services & Networking básico" com status `disponivel`.
2. Aluno L4 (nível demonstrado em "Troubleshooting multi-serviço") pede simulação de incidente no mesmo tópico → cenário injeta 3–4 componentes, 2–3 red herrings, causa sistêmica, sem dica proativa.
3. Aluno tenta abrir simulação de um tópico com `progresso_topico.status = bloqueado` (pré-requisito não cumprido) → `POST /sessions` retorna `409 pre_requisito_faltante` com o id do tópico faltante; frontend mostra o modo bloqueado com o motivo, nunca omitido do menu.
4. Aluno erra a checagem de entendimento na aula 2 vezes seguidas → agente corrige a lacuna específica (não repete a aula inteira) antes de tentar fechar o tópico.
5. Ao concluir uma simulação, `progresso_topico.tentativas` incrementa e `nivel_demonstrado` só é promovido se a avaliação final atingir o critério de domínio — não basta "sobreviver" à sessão.
6. `GET /api/trilhas/:id/topicos` nunca omite um tópico bloqueado da lista — sempre retorna com `status: bloqueado` e `pre_requisito_faltante_id`.

---

## 7. Riscos, trade-offs e decisões em aberto

- **Parsing do fechamento estruturado** (`[FECHAMENTO_TOPICO ...]`): depende do LLM respeitar o formato. Mitigação: validar com regex tolerante + fallback "sessão permanece em_andamento, aluno tenta de novo" se o parsing falhar — nunca travar o progresso do aluno por erro de formatação do modelo.
- **Regressão de nível** (R5 menciona "regredir/reforçar quando desempenho cai"): a regra exata de quando rebaixar `nivel_demonstrado` não foi definida neste documento — proposta mínima: 2 avaliações consecutivas abaixo do critério de domínio rebaixam 1 nível, mas **isso é uma suposição explícita, não uma decisão tomada** — precisa de validação humana antes de implementar.
- **Autenticação**: hoje `usuarios` é só um UUID sem login (o cliente gera/guarda o id). Progresso por tópico funciona igual, mas fica preso ao mesmo mecanismo de identidade fraca já existente — fora do escopo mudar isso aqui.
- **Cenários reaproveitados entre níveis**: os 6 cenários de `kubernetes` viram cenário-base de um tópico só (ex.: o de "incidente" vira base do tópico "Troubleshooting"); os demais tópicos (Pods, Services, ConfigMaps) precisam de cenário-base novo — listar como trabalho de seed pendente, não coberto pelos 6 existentes.
- **Custo/latência de LLM**: calibração dinâmica via prompt (decisão já tomada) evita explosão de seeds, mas aumenta a responsabilidade do prompt de simulação — vale revisão de qualidade manual nos primeiros testes antes de destravar todos os 5 níveis.

---

## 8. Ordem de implementação em fatias

**Fatia 0 (schema)** — `002_learning_track.sql` aditiva + seed da trilha Kubernetes L1–L2 (tópicos 1–3 da tabela da seção 2), sem tocar em rotas ainda. Verificação: migração roda limpa sobre `001_init.sql` existente, seed popula `trilhas`/`topicos`.

**Fatia 1 (MVP da demo — aula + checagem)** — `backend/src/prompts/aula.txt`, `buildAulaPrompt`, `POST /sessions {tipo_sessao: aula}`, parsing do `[FECHAMENTO_TOPICO]`, `progresso_topico` sendo gravado. Verificação: aluno consegue completar a aula de "Pods & Deployments" e o registro de progresso aparece no banco.

**Fatia 2 (MVP da demo — menu + calibração)** — diff nos 3 prompts de simulação (seção 5), `calibracaoParaNivel`, `GET /api/trilhas/:id/topicos` com status calculado, endpoint de menu pós-tópico, bloqueio por pré-requisito. Verificação: casos de teste 1–3 da seção 6 passam manualmente.

**Fatia 3 (frontend mínimo da demo)** — tela de trilha (lista de tópicos com estado), tela de aula reaproveitando o componente de chat existente, tela de menu pós-tópico. Sem redesenho visual, só o suficiente para a demo de 5 min funcionar fim a fim.

**Fatia 4 (pós-demo, fora do MVP)** — regressão/reforço de nível (decisão em aberto acima), expansão da trilha Kubernetes para L3–L5, réplica do padrão para o domínio `backend`, estruturação de `avaliacoes` (hoje texto livre) em rubrica com score numérico reaproveitável por `progresso_topico`.

---

## Verificação end-to-end proposta (após implementação)

1. `psql` contra o banco local (`up.sh`/docker do próprio projeto) rodando `002_learning_track.sql` sobre uma cópia da `001_init.sql` já aplicada — checar `\d topicos`, `\d progresso_topico`.
2. Via `curl`/Postman: `POST /api/sessions {tipo_sessao: aula, topicoId: <Pods&Deployments>}` → completar a checagem → `POST /sessions/:id/end` → `GET /api/trilhas/:id/topicos` mostrando o tópico 1 `concluido` e o tópico 2 `disponivel`.
3. `POST /api/sessions {tipo_sessao: simulacao, modo: incidente, topicoId: <Pods&Deployments>}` → inspecionar o `system_prompt` gravado na sessão e confirmar que os placeholders de calibração L1 foram preenchidos (1 componente, 0 red herrings).
4. No frontend, rodar a demo completa: escolher trilha → aula → menu → simulação → avaliação → voltar ao menu de trilha e ver o próximo tópico liberado.
