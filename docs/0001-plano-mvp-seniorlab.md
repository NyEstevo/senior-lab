# 0001 — Plano MVP SeniorLab (Docker + Docker Compose, local)

**Status:** Proposto
**Data:** 2026-09-15
**Autor:** NyEstevo

---

## Decisões (seção 4 do prompt)

| # | Decisão | Escolha | Justificativa |
|---|---|---|---|
| D1 | Linguagem do backend | **Node.js/TypeScript** `[SUPOSIÇÃO]` | Compartilha tipos (DTOs de sessão/mensagem/avaliação) com o frontend React/TS via um pacote de tipos comum; o SDK oficial `@anthropic-ai/sdk` tem paridade total em TS; reduz o número de linguagens que o time heterogêneo precisa dominar (só JS/TS de ponta a ponta). |
| D2 | Framework HTTP | **Express** `[SUPOSIÇÃO]` | Maior familiaridade e documentação disponível para um time heterogêneo em infra; nenhuma vantagem de performance de um Fastify é relevante no volume de uma demo. |
| D3 | Autenticação | **Sem login real** — identificador de usuário fake, gerado (UUID) no primeiro acesso e persistido em cookie + tabela `usuarios` `[SUPOSIÇÃO]` | A trilha de evolução do usuário só precisa de um `usuario_id` estável entre sessões; login real (senha, hash, recuperação) é custo de implementação sem valor demonstrável em 5 minutos de vídeo. |
| D4 | Redis | **Removido** `[SUPOSIÇÃO]` | O histórico de conversa e a sessão cabem inteiramente no Postgres para o volume de uma demo (dezenas de sessões, não milhares de usuários concorrentes). Um serviço a mais é um healthcheck a mais, uma variável de ambiente a mais e um ponto a mais de falha — sem ganho perceptível na demo. |
| D5 | Transporte da resposta do agente | **Request-response simples** `[SUPOSIÇÃO]` | Sob prazo curto e time heterogêneo em infra, SSE adiciona complexidade de estado no frontend (parsing de stream, reconexão, cancelamento) que não é o gargalo do MVP. O trade-off de percepção de latência na demo está registrado na seção 10 (riscos) e streaming entra como melhoria de curto prazo no roadmap (seção 11). |
| D6 | Cenários | **Híbrido**: templates fixos (os 4 system prompts fornecidos) + variação de variáveis (`domain`, `symptom`, `root_cause`, `pr_context`, `planted_issues`, `architecture_problem`, `constraints`, `traps`) sorteadas de uma lista de seed por domínio `[SUPOSIÇÃO]` | Evita depender de uma chamada extra à Claude API só para gerar o cenário (custo e latência antes mesmo da sessão começar) e garante que a demo sempre tenha cenários coerentes e testados. |
| D7 | Histórico de conversa | Persistido na tabela `mensagens` (Postgres), uma linha por turno; remontado a cada chamada lendo todas as mensagens da sessão ordenadas por `criado_em` e mapeando para o array `{ role, content }` exigido pela Messages API. | Evita estado em memória do processo (que quebraria com hot reload/restart do backend) e é a fonte única também para a tela de histórico (contrato 5.6). |
| D8 | Modelo, `max_tokens` e custo | Modelo `claude-sonnet-4-6` `[SUPOSIÇÃO — ID indicado pelo usuário, não confirmado de forma independente na documentação oficial; validar antes de codar]`; `max_tokens: 1024` por resposta (valor do exemplo de referência); teto de **15 turnos por sessão** (o maior teto entre os três modos, cobre incidente e arquitetura; code review encerra sozinho em 12). Estimativa de custo por sessão: **[A CONFIRMAR]** — depende do preço vigente por milhão de tokens do modelo escolhido, que não deve ser chutado. Fórmula para o time aplicar assim que o preço for confirmado: `custo_sessão ≈ Σ(turno=1..15) [ (tokens_system + tokens_histórico_acumulado_até_turno + tokens_input_turno) × preço_input + tokens_output_turno × preço_output ]`, notando que `tokens_histórico_acumulado` cresce a cada turno (o array `messages` é reenviado inteiro a cada chamada) — esse crescimento quadrático é o principal driver de custo e está tratado como risco na seção 10. |

---

## 5.1 Visão de arquitetura

```
┌─────────────┐        HTTP :5173         ┌──────────────────┐       HTTP :3000        ┌──────────────────┐
│  Browser    │ ────────────────────────▶ │  frontend         │ ───────────────────────▶│  backend          │
│  (usuário)  │ ◀──────────────────────── │  (React + Vite,   │ ◀─────────────────────── │  (Node/Express)   │
└─────────────┘   HTML/JS/CSS + fetch     │  container dev    │   JSON (/api/*)          │  container dev    │
                                           │  server na porta   │                          │  porta 3000        │
                                           │  5173)             │                          └────────┬──────────┘
                                           └───────────────────┘                                    │
                                                                                                       │ TCP :5432
                                                                                            ┌──────────▼──────────┐
                                                                                            │  postgres            │
                                                                                            │  volume nomeado       │
                                                                                            │  porta 5432 (interna) │
                                                                                            └──────────────────────┘
                                                                                                       ▲
                                                                                                       │ HTTPS 443
                                                                                            ┌──────────┴──────────┐
                                                                                            │  api.anthropic.com   │
                                                                                            │  (Claude API,        │
                                                                                            │   fora do compose)   │
                                                                                            └──────────────────────┘
```

**Caminho de uma requisição de chat (um turno):**

1. Browser envia `POST /api/sessions/:id/turns` com `{ message }` para o `frontend` (Vite dev server), que faz proxy/CORS para o `backend` em `http://backend:3000` (nome do serviço na rede interna do compose).
2. `backend` lê a sessão e o histórico em `postgres` (`SELECT * FROM mensagens WHERE sessao_id = $1 ORDER BY criado_em`).
3. `backend` monta `system` (a partir do template do modo + variáveis da sessão) e `messages` (histórico + mensagem nova) e chama `POST https://api.anthropic.com/v1/messages` via `@anthropic-ai/sdk`, saindo do container através do gateway padrão da rede Docker (sem serviço intermediário).
4. Claude API responde; `backend` grava a resposta como nova linha em `mensagens` e devolve `{ role: "assistant", content }` ao `frontend`.
5. `frontend` renderiza a resposta na tela de chat.

Todos os serviços do compose (`frontend`, `backend`, `postgres`) estão na mesma rede interna (`seniorlab-net`); só `frontend` (5173) e `backend` (3000, exposto para debug direto/health checks manuais) publicam porta no host. `postgres` (5432) não é publicado no host — só acessível dentro da rede do compose.

---

## 5.2 Árvore de diretórios

```
senior-lab/
├── docker-compose.yml        # orquestra frontend, backend e postgres
├── .env.example               # placeholders de todas as env vars (chave Anthropic, DB, portas)
├── README.md                  # setup em <20 linhas
├── docs/
│   └── 0001-plano-mvp-seniorlab.md   # este documento
├── frontend/
│   ├── Dockerfile             # multi-stage: target dev (hot reload) e target prod
│   ├── src/                   # componentes React (fora do escopo deste plano)
│   └── package.json
├── backend/
│   ├── Dockerfile             # multi-stage: target dev (hot reload) e target prod
│   ├── src/
│   │   ├── prompts/           # os 4 templates de system prompt (incidente, review, arquitetura, avaliação)
│   │   ├── seed/              # dados de cenário por domínio (JSON) usados no D6
│   │   └── migrations/        # SQL idempotente aplicado no boot
│   └── package.json
└── db/
    └── init/                  # scripts opcionais de bootstrap consumidos pela imagem oficial do postgres
```

---

## 5.3 `docker-compose.yml`

```yaml
# Versões de imagem fixadas nas tags abaixo. Node/Postgres LTS — validar o patch exato
# na documentação oficial antes de codar: [A CONFIRMAR] o patch de node:20-alpine e
# postgres:16-alpine vigentes no momento da implementação.
services:
  postgres:
    image: postgres:16-alpine   # [A CONFIRMAR] menor patch estável disponível
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - seniorlab_pgdata:/var/lib/postgresql/data   # volume nomeado: dados sobrevivem a `down` sem `-v`
    networks:
      - seniorlab-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10
    # porta 5432 NÃO publicada no host: só backend acessa, via rede interna

  backend:
    build:
      context: ./backend
      target: dev                      # troca para `prod` no build de produção (ver 5.4)
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      PORT: 3000
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      ANTHROPIC_MODEL: ${ANTHROPIC_MODEL}
      MAX_TURNS_PER_SESSION: ${MAX_TURNS_PER_SESSION}
    volumes:
      - ./backend/src:/app/src         # bind mount: hot reload sem rebuild de imagem
      - backend_node_modules:/app/node_modules   # evita node_modules do host sobrescrever o da imagem
    depends_on:
      postgres:
        condition: service_healthy      # backend só sobe depois do Postgres aceitar conexões
    networks:
      - seniorlab-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 15s                 # dá tempo pra migration rodar no boot antes do primeiro check

  frontend:
    build:
      context: ./frontend
      target: dev
    restart: unless-stopped
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:3000
    volumes:
      - ./frontend/src:/app/src         # bind mount: hot reload do Vite
      - frontend_node_modules:/app/node_modules
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - seniorlab-net

networks:
  seniorlab-net:
    driver: bridge

volumes:
  seniorlab_pgdata:        # nomeado — persiste dados do Postgres entre `docker compose down`
  backend_node_modules:    # nomeado — evita conflito de binários nativos entre host e container
  frontend_node_modules:
```

`.env.example` correspondente:

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_MODEL=claude-sonnet-4-6

# Postgres
POSTGRES_USER=seniorlab
POSTGRES_PASSWORD=changeme
POSTGRES_DB=seniorlab

# Regra de negócio
MAX_TURNS_PER_SESSION=15
```

---

## 5.4 Dockerfiles (dev e prod)

### `backend/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS base   # [A CONFIRMAR] menor patch estável
WORKDIR /app
COPY package.json package-lock.json ./

# ---------- dev ----------
FROM base AS dev
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]     # ex.: nodemon/tsx watch — reinicia ao detectar mudança no bind mount

# ---------- build (compila TS) ----------
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build             # gera /app/dist

# ---------- prod ----------
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### `frontend/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

# ---------- dev ----------
FROM base AS dev
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]   # Vite precisa bindar em 0.0.0.0 dentro do container

# ---------- build ----------
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build              # gera /app/dist (estático)

# ---------- prod ----------
FROM nginx:1.27-alpine AS prod   # [A CONFIRMAR] menor patch estável
COPY --from=build /app/dist /usr/share/nginx/html
RUN adduser -D -H app && chown -R app /usr/share/nginx/html
USER app
EXPOSE 80
```

**O que muda entre dev e prod:**
- Dev roda o próprio servidor de desenvolvimento (nodemon/tsx no backend, Vite dev server no frontend) com bind mount do código-fonte — build acontece uma vez na imagem e o código muda por fora, sem rebuild.
- Prod é multi-stage: um estágio compila (TS→JS no backend, React→estático no frontend) e o estágio final só copia o artefato compilado para uma imagem mínima (`node:20-alpine` rodando só o JS compilado; `nginx:alpine` servindo estático), sem `devDependencies`, sem código-fonte TS, e com usuário não-root em ambos.
- Dev expõe a porta do dev server (3000/5173); prod expõe a porta do processo final (3000 no backend compilado; 80 no Nginx do frontend).

---

## 5.5 Modelo de dados

```sql
-- Idempotente: toda migration usa IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- Ferramenta de migration: [A CONFIRMAR] — candidata: node-pg-migrate (TS-friendly, sem
-- dependência de linguagem extra). Rodada automaticamente no boot do container `backend`
-- (script `npm run migrate` chamado antes de `npm run dev`/`node dist/index.js` no CMD/entrypoint),
-- e é segura para rodar toda vez que o container sobe porque cada migration é idempotente
-- e a própria ferramenta registra o que já rodou em uma tabela de controle (`pgmigrations`).

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio TEXT NOT NULL CHECK (dominio IN ('backend', 'kubernetes')),
  modo TEXT NOT NULL CHECK (modo IN ('incidente', 'code_review', 'arquitetura')),
  variaveis JSONB NOT NULL,          -- domain/symptom/root_cause etc, conforme o modo
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cenarios_dominio_modo ON cenarios (dominio, modo);

CREATE TABLE IF NOT EXISTS sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  cenario_id UUID NOT NULL REFERENCES cenarios(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'evaluating', 'completed')),
  system_prompt TEXT NOT NULL,        -- prompt final já com variáveis substituídas (auditável)
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
  conteudo TEXT NOT NULL,             -- texto da avaliação final emitida pelo agente
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5.6 Contrato da API

| Método | Rota | Payload de entrada | Resposta de sucesso | Erros previstos |
|---|---|---|---|---|
| POST | `/api/sessions` | `{ usuarioId, dominio, modo }` | `201 { sessaoId, cenario, mensagemInicial }` | `400` domínio/modo inválido · `500` falha ao gerar cenário |
| POST | `/api/sessions/:id/turns` | `{ mensagem }` | `200 { role: "assistant", conteudo }` | `404` sessão não existe · `409` sessão já `completed` · `422` teto de turnos atingido · `502` falha da Claude API (ver 5.7) |
| POST | `/api/sessions/:id/end` | `{}` | `200 { avaliacao }` (troca o system prompt para o modo avaliação, seção 5.7, e persiste em `avaliacoes`) | `404` sessão não existe · `409` sessão já encerrada |
| GET | `/api/sessions/:id` | — | `200 { sessao, mensagens[], avaliacao? }` | `404` sessão não existe |
| GET | `/api/users/:id/sessions` | — | `200 { sessoes: [{ id, dominio, modo, status, criadoEm }] }` (trilha de evolução) | `404` usuário não existe |
| GET | `/health` | — | `200 { status: "ok", db: "ok" }` | `503` se Postgres não responde |

---

## 5.7 Arquitetura do agente

**Montagem do system prompt (4 camadas):** o backend guarda os 3 templates de modo (incidente/code review/arquitetura) mais o bloco de instruções de avaliação em `backend/src/prompts/*.txt` (um arquivo por modo, texto puro com placeholders `{{variavel}}`, exatamente como fornecido na especificação de system prompts). Ao criar a sessão, o backend:
1. Sorteia (ou recebe explícito) `dominio` + `modo`.
2. Sorteia um registro de `cenarios` (seed, ver D6) com as variáveis daquele domínio/modo.
3. Aplica `template.replace(/\{\{(\w+)\}\}/g, (_, k) => variaveis[k] ?? \`[${k} não definido]\`)` — a mesma função já especificada na seção de system prompts — e grava o resultado em `sessoes.system_prompt`.

**Templates no repositório:** `backend/src/prompts/incidente.txt`, `code-review.txt`, `arquitetura.txt`; cada um já contém, ao final do próprio texto, a seção de instrução de avaliação (conforme fornecido), então não há um quarto arquivo separado — a troca para avaliação é uma instrução dentro do mesmo prompt, ativada por evento (turno final), não um prompt diferente.

**Acúmulo de histórico:** cada turno grava duas linhas em `mensagens` (a do usuário, depois a do assistente) e a próxima chamada à Claude API remonta `messages` lendo todas as linhas da sessão em ordem — implementação de D7.

**Troca para o modo avaliação no encerramento:** o encerramento (`POST /api/sessions/:id/end`) é disparado por (a) o dev sinalizar fim, (b) o backend detectar que `COUNT(mensagens) / 2 >= teto_de_turnos_do_modo` (12 para code review, 15 para os outros dois). Nos dois casos o backend faz **uma última chamada** à Claude API reusando o mesmo `system` (que já contém as instruções de avaliação ao final) e injeta como última mensagem `user` uma instrução curta fixa, por exemplo `"[sistema] Encerre a simulação e entre no modo avaliação conforme as instruções do seu system prompt."` — isso evita precisar de um segundo template e garante que o agente tenha todo o histórico da conversa ao avaliar.

**Tratamento de falha (todas as chamadas à Claude API, em `backend/src/agent/client.ts`):**

| Falha | Tratamento |
|---|---|
| `429` (rate limit) | 1 retry com backoff de ~2s; se falhar de novo, `502` para o frontend com `{ erro: "agente_sobrecarregado", tentarNovamente: true }` |
| `5xx` da Claude API | 1 retry com backoff; se falhar de novo, `502` com `{ erro: "agente_indisponivel" }` — a mensagem do usuário já foi salva em `mensagens`, então nada se perde e o turno pode ser reenviado |
| Timeout (cliente configurado com timeout de ~30s) | Mesmo tratamento de `5xx` — aborta a chamada, retorna `504` |
| Resposta truncada (`stop_reason === "max_tokens"`) | Backend salva o conteúdo parcial mesmo assim e retorna `200` com um campo `{ truncado: true }`, deixando o frontend avisar o usuário sem quebrar o fluxo |
| Chave ausente/inválida (`ANTHROPIC_API_KEY` vazia ou `401`) | Falha **no boot** do backend (`/health` retorna `503` com `{ erro: "chave_anthropic_ausente" }`) — checado uma vez na subida, não a cada turno, para falhar cedo e visível no `docker compose up` em vez de só no primeiro turno da demo |

---

## 5.8 Plano de execução em fatias verticais

| # | Fatia | Objetivo demonstrável | Arquivos principais | Dependências | Critério de aceite |
|---|---|---|---|---|---|
| 1 | Ambiente sobe | `docker compose up -d` deixa os 3 containers saudáveis | `docker-compose.yml`, Dockerfiles, `.env.example` | nenhuma | `docker compose ps` mostra os 3 serviços `healthy`; `curl localhost:3000/health` → `200` |
| 2 | Migration + seed no boot | Tabelas existem e há cenários de seed carregados | `backend/src/migrations/*`, `backend/src/seed/*` | fatia 1 | `psql` (via `docker compose exec postgres psql`) mostra as 5 tabelas e `SELECT count(*) FROM cenarios` > 0 |
| 3 | Criar sessão + primeiro turno na tela | Usuário abre o frontend, escolhe domínio/modo, vê a abertura do cenário e envia uma mensagem, agente responde | `POST /api/sessions`, `POST /api/sessions/:id/turns`, tela de chat mínima | fatias 1–2 | Na tela do browser: escolher modo → aparece mensagem inicial do agente → enviar 1 mensagem → resposta aparece, sem reload de página |
| 4 | Múltiplos turnos + persistência | Fechar e reabrir a sessão mantém o histórico | `GET /api/sessions/:id`, remontagem de `messages` | fatia 3 | `docker compose restart backend` no meio de uma sessão; reabrir a mesma `sessaoId` no browser mostra o histórico completo |
| 5 | Encerramento + avaliação | Botão "encerrar sessão" mostra o texto de avaliação final | `POST /api/sessions/:id/end`, troca de prompt (5.7) | fatia 4 | Clicar em "encerrar" na tela → aparece texto de avaliação distinto do tom do cenário (fora de personagem) |
| 6 | Trilha de evolução | Lista de sessões passadas do usuário | `GET /api/users/:id/sessions`, tela de histórico | fatia 5 | Criar 2 sessões, encerrar 1 → tela de histórico lista as 2 com status correto |
| 7 | Tratamento de falha visível | Erro de rede/API não quebra a tela | tratamento de 5.7, feedback de erro no frontend | fatia 3 | Derrubar `ANTHROPIC_API_KEY` do `.env` e subir → `/health` reporta `503` claro, container não fica em loop de crash |

---

## 5.9 Smoke test local

```bash
# 1. Clonar e configurar
cp .env.example .env
# preencher ANTHROPIC_API_KEY no .env

# 2. Subir tudo
docker compose up -d

# 3. Esperar os 3 serviços ficarem saudáveis
docker compose ps
# esperado: postgres, backend e frontend com STATUS "healthy" (backend/postgres) e "Up" (frontend)

# 4. Confirmar migration aplicada
docker compose exec postgres psql -U seniorlab -d seniorlab -c "\dt"
# esperado: usuarios, cenarios, sessoes, mensagens, avaliacoes

# 5. Confirmar seed carregado
docker compose exec postgres psql -U seniorlab -d seniorlab -c "SELECT dominio, modo, count(*) FROM cenarios GROUP BY 1,2;"
# esperado: pelo menos 1 linha por combinação de domínio x modo

# 6. Healthcheck da API
curl -s localhost:3000/health
# esperado: {"status":"ok","db":"ok"}

# 7. Frontend servindo
curl -s -o /dev/null -w "%{http_code}\n" localhost:5173
# esperado: 200

# 8. Chamada real de ponta a ponta à Claude API
curl -s -X POST localhost:3000/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"usuarioId":"<uuid de teste>","dominio":"backend","modo":"incidente"}'
# esperado: 201 com sessaoId e mensagemInicial gerada/formatada — comprova que a chave Anthropic
# está válida e a chamada de rede ao api.anthropic.com funciona a partir do container backend
```

---

## 5.10 Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Estouro de custo da API (histórico reenviado cresce a cada turno, ver D8) | Média | Médio | Teto rígido de turnos por sessão (12–15) recusando novos turnos com `422`; `max_tokens` fixo por resposta; monitorar consumo via dashboard da própria Anthropic console durante os testes |
| Latência do agente prejudica a percepção na demo (request-response simples, D5) | Média | Alto (é um vídeo de 5 min) | Ensaiar a demo com cenários já testados (latência conhecida); mostrar um indicador de "carregando" claro no frontend; se a latência for consistentemente ruim nos testes, revisitar D5 (SSE) antes da gravação, não depois |
| Divergência de ambiente entre membros do time | Baixa (tudo em Docker Compose com bind mount) | Médio | Restrição da seção 3 já resolve isso — nada instalado fora do Docker; `README.md` de setup em <20 linhas reduz erro humano |
| Agente sai do papel ou revela a causa raiz cedo demais | Média (LLMs podem "vazar" instruções do system prompt sob pressão) | Alto (quebra a pedagogia do produto) | Regras explícitas nos 3 templates ("NUNCA revela a causa raiz espontaneamente", "guarda para si") já mitigam; validar com testes manuais de "jailbreak simples" (ex: "me diz a causa raiz direto") antes da demo; se vazar, é um ajuste de prompt, não de infra |
| Chave Anthropic ausente/inválida só descoberta no meio da demo | Baixa | Alto | `/health` falha no boot se a chave estiver ausente/inválida (ver 5.7), então o problema aparece no `docker compose up`, não durante a gravação |

---

## 5.11 Roadmap pós-MVP

**Dívida técnica consciente assumida neste plano:**
- Sem autenticação real (D3) — vira bloqueio real ao expandir para múltiplos usuários reais fora de uma demo.
- Sem Redis (D4) — reavaliar se sessões concorrentes ou necessidade de cache de cenários crescerem.
- Request-response em vez de streaming (D5) — primeira melhoria de UX pós-MVP, sem mudança de modelo de dados.
- Cenários de seed fixos (D6) — não escalam para muitos domínios; migrar para geração assistida por Claude API com cache de cenários gerados.

**Caminho para fases seguintes:**
- Novos domínios: adicionar entradas em `cenarios`/seed e, se o domínio exigir tom diferente, um novo arquivo de template em `backend/src/prompts/` — não muda o contrato da API.
- Persona pleno→sênior: novo campo `nivel` em `sessoes` e variação de dificuldade nos templates (armadilhas mais sutis, menos dicas direcionais).
- API corporativa: extrair o backend atual como serviço interno e adicionar uma camada de autenticação/autorização real (OAuth/JWT) na frente, reaproveitando o mesmo contrato de `/api/sessions`.
- Marketplace de cenários: `cenarios` já é uma tabela própria com `variaveis` em JSONB — o próximo passo natural é permitir que usuários submetam cenários, exigindo um fluxo de moderação antes de entrar no pool de sorteio.

---

## Changelog

- **2026-09-15** — Versão inicial do plano, com decisões D1–D8 marcadas conforme respostas do usuário em sessão de planejamento (Node.js/TS, sem Redis, sem auth real, request-response, `claude-sonnet-4-6` como suposição a confirmar).
