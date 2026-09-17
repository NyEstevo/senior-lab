---
titulo: Terraform de provisionamento do SeniorLab (OCI e GCP)
status: Aprovado
autor: Claude (agente)
data: 2026-09-16
---

> **Gate humano**: o campo `status` acima permanece `Proposto`. Esta rodada é só de
> planejamento — nenhum arquivo `.tf` foi criado. A mudança para `Aprovado` é feita
> exclusivamente por edição humana deste arquivo. Enquanto não estiver `Aprovado`,
> nenhum arquivo de infraestrutura pode ser criado.

## Sumário

O SeniorLab hoje roda 100% local via Docker Compose. Este documento planeja o Terraform
para provisionar a plataforma em nuvem — em duas raízes independentes, OCI e GCP — sem
decidir qual das duas será usada. Cada raiz é aplicável sozinha, sem ordem entre elas e
sem etapas compartilhadas. Manifestos Kubernetes e pipelines de CI/CD estão fora de
escopo; este Terraform entrega a plataforma pronta para recebê-los.

---

## Fase 1 — Análise do repositório

### 1.1 Inventário de Serviços

Fonte: `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`,
`backend/package.json`.

| Serviço | Imagem / Build | Portas (host:container) | Comando de start | Volumes | Depends on | Healthcheck | Stateful? | Exposto publicamente? |
|---|---|---|---|---|---|---|---|---|
| `postgres` | `postgres:16-alpine` (`docker-compose.yml:3`) | nenhuma publicada — só `5432` interno (sem bloco `ports:`) | padrão da imagem | `seniorlab_pgdata:/var/lib/postgresql/data` (`docker-compose.yml:10`) | — | `pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}` (`docker-compose.yml:13-17`) | **Sim** | Não |
| `backend` | build `./backend`, target `dev`/`prod` (`docker-compose.yml:20-22`); Dockerfile multi-stage, base `node:20-alpine` (`backend/Dockerfile:2`), prod final também `node:20-alpine` com `npm install --omit=dev` (`backend/Dockerfile:20-29`) | `3000:3000` (`docker-compose.yml:25`) | dev: `npm run dev` (`backend/Dockerfile:11`); prod: `npm run start` → `node dist/migrations/run.js && node dist/index.js` (`backend/package.json:10`) | bind `./backend/src:/app/src`; nomeado `backend_node_modules:/app/node_modules` (`docker-compose.yml:35-36`) | `postgres` condição `service_healthy` (`docker-compose.yml:38-39`) | `wget -qO- http://localhost:3000/health` (`docker-compose.yml:42-47`) | **Não** — sem volume de dados; migração/seed rodam no boot do próprio processo | **Sim**, sem autenticação (`backend/src/index.ts:8-9` só `cors()` e `express.json()`) |
| `frontend` | build `./frontend`, target `dev`/`prod` (`docker-compose.yml:50-52`); dev `node:20-alpine`, prod `nginx:1.27-alpine` servindo estático (`frontend/Dockerfile:20-24`) | `5173:5173` dev (`docker-compose.yml:55`); prod expõe `80` (`frontend/Dockerfile:24`) | dev: `npm run dev -- --host 0.0.0.0` (`frontend/Dockerfile:11`); prod: nginx padrão | bind `./frontend/src:/app/src`; nomeado `frontend_node_modules:/app/node_modules` (`docker-compose.yml:59-60`) | `backend` condição `service_healthy` (`docker-compose.yml:62-63`) | não definido no compose | **Não** — estático | **Sim** |

### 1.2 Variáveis de ambiente e configuração

Fonte: `.env.example`.

| Variável | Linha | Classificação | Observação |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | `.env.example:2` | **(b) Segredo** | Chave da API Anthropic (`sk-ant-*`) |
| `ANTHROPIC_MODEL` | `.env.example:3` | (a) Config não sensível | Ex.: `claude-sonnet-4-6`; o próprio código tem fallback divergente para `claude-haiku-4-5-20251001` (`backend/src/agent/client.ts:10`) e `claude-sonnet-4-6` (`backend/src/agent/health.ts:24`) — inconsistência já existente no repositório, não introduzida por este plano |
| `POSTGRES_USER` | `.env.example:6` | (a) Config não sensível | — |
| `POSTGRES_PASSWORD` | `.env.example:7` | **(b) Segredo** | — |
| `POSTGRES_DB` | `.env.example:8` | (a) Config não sensível | — |
| `MAX_TURNS_PER_SESSION` | `.env.example:11` | (a) Config não sensível | Regra de negócio, não infra |
| `MAX_TURNS_CODE_REVIEW` | `.env.example:12` | (a) Config não sensível | Regra de negócio, não infra |
| `DATABASE_URL` | `docker-compose.yml:29` (montada, não está no `.env.example`) | **(b) Segredo composto** | Contém usuário+senha embutidos: `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}` |
| `VITE_API_URL` | `docker-compose.yml:57` | (c) Endpoint (interno hoje) | Build-time do frontend, vira parte do bundle estático — em nuvem precisa apontar para a URL pública do backend |
| `MAX_TURNS_ENSINO` | não documentada em `.env.example`; usada em `backend/src/types.ts:20` (default 20) | (a) Config não sensível | **LACUNA**: variável usada no código mas ausente do `.env.example` |

**Endpoint externo (c)**: `https://api.anthropic.com` — chamado via `@anthropic-ai/sdk`
em `backend/src/agent/client.ts:4-8` e `backend/src/agent/health.ts:3-7`.

### 1.3 Dependências de estado

| Recurso | Engine/versão | Evidência |
|---|---|---|
| Banco relacional | PostgreSQL **16** (tag `16-alpine`) | `docker-compose.yml:3` |
| Cache | **Nenhum** — removido deliberadamente | `docs/0001-plano-mvp-seniorlab.md:16` (decisão D4: "Redis — Removido") |
| Fila | **Nenhuma** | sem evidência no código |
| Object storage | **Nenhum** | sem evidência no código |
| Vector store | **Nenhum** | sem evidência no código (sem embeddings) |

### 1.4 Integrações externas

- **Anthropic Claude API** (`@anthropic-ai/sdk@^0.32.1`, `backend/package.json:13`):
  exige `ANTHROPIC_API_KEY` (chave), egress HTTPS para `api.anthropic.com:443`, sem cota
  além da própria conta Anthropic. Chamada validada no boot do backend
  (`backend/src/agent/health.ts:15-40`, `backend/src/index.ts:35`) — se a chave for
  inválida, `/health` retorna `503` e o processo não fica saudável.
- **Nenhuma outra integração de terceiro** (sem OAuth, sem storage externo, sem outro SDK).

### 1.5 Runtime e build

| Serviço | Linguagem/runtime | Gerenciador de pacotes | Stateless? |
|---|---|---|---|
| backend | Node.js 20 (TypeScript compilado) | npm (`backend/package.json`) | Sim |
| frontend | Node.js 20 (build) → Nginx 1.27 (serve estático) | npm | Sim |

Não há indicação de tamanho de imagem no repositório (marcado `[A CONFIRMAR]` no próprio
`docs/0001-plano-mvp-seniorlab.md:90-95,193`) — **LACUNA**, tratada como não-bloqueante
(imagens `alpine` são a base, tipicamente pequenas).

### 1.6 Requisitos de rede

- Público: `frontend` (site) e `backend` (API HTTP, hoje exposta direto no Compose para
  debug — `docker-compose.yml:24-25`, justificado em `docs/0001-plano-mvp-seniorlab.md:57`
  como "exposto para debug direto/health checks manuais").
- Interno: `postgres`, nunca publicado (`docker-compose.yml` não tem `ports:` para
  `postgres`).
- **Sem WebSocket/SSE** — decisão explícita D5, "request-response simples"
  (`docs/0001-plano-mvp-seniorlab.md:17`); confirmado no código via
  `frontend/src/api.ts:130-135` (`POST` síncrono, sem streaming).

### 1.7 Migrações, seeds e jobs one-off

- Migração idempotente: `backend/src/migrations/run.ts:10-44`, arquivos
  `001_init.sql`, `002_learning_track.sql`, `003_encerrada_status.sql` em
  `backend/src/migrations/`.
- Seed condicional (só insere se tabela vazia): `backend/src/seed/run.ts:5-19,21-67`.
- Execução: **dentro do próprio processo do backend no boot**, não como Job separado —
  `npm run start` → `node dist/migrations/run.js && node dist/index.js`
  (`backend/package.json:10`). Isso significa que a plataforma de nuvem não precisa de um
  recurso de Job/CronJob dedicado para migração; basta que o `entrypoint`/`command` do
  container de produção rode esse mesmo binário antes do servidor HTTP subir — o que já é
  o comportamento do Dockerfile de prod.

### 1.8 Requisitos de Infraestrutura (agnósticos de nuvem, derivados do inventário acima)

1. Runtime de container para 2 workloads stateless (API HTTP `backend`, site estático
   `frontend`) — sem indicação de necessidade de autoscaling por fila/CPU no repositório.
2. Banco relacional PostgreSQL 16 gerenciado, com persistência e backup automatizado.
3. Registry de imagens de container para as 2 imagens de produção (`backend` Node,
   `frontend` Nginx).
4. Cofre de segredos para `ANTHROPIC_API_KEY` e credenciais do Postgres (`POSTGRES_USER`,
   `POSTGRES_PASSWORD`, ou o `DATABASE_URL` composto) — nunca em texto plano.
5. Rede com segmentação pública/privada: subnet pública só para o ponto de entrada
   (load balancer), subnet privada para banco e para o `backend` (decisão da Fase 2);
   egress HTTPS liberado para `api.anthropic.com`.
6. Um único ponto de exposição pública com TLS (frontend); backend acessível só através
   dele (ver Fase 2 — decisão confirmada com a usuária).
7. IAM de menor privilégio: a identidade da carga de trabalho só lê os segredos que usa e
   só faz pull das imagens que precisa.
8. State remoto do Terraform, separado por nuvem, sem `terraform_remote_state` cruzado.
9. **Não provisionar**: cache/Redis, fila, object storage, vector store — ausentes do
   MVP por decisão explícita (`docs/0001-plano-mvp-seniorlab.md:16`) e sem uso no código.

### 1.9 LACUNAS (repositório não responde)

| Lacuna | Tratamento neste plano |
|---|---|
| Domínio/DNS de produção | Variável `domain_name` obrigatória, sem valor real por padrão; TLS/DNS documentados como etapa que só se completa quando um domínio real for informado (confirmado com a usuária — não bloqueia `apply`) |
| Patch exato de `postgres:16-alpine` e `node:20-alpine` | O próprio repositório marca `[A CONFIRMAR]` (`docs/0001-plano-mvp-seniorlab.md:90-95,193`); este plano fixa a minor (`16`, `20`) e deixa o patch exato como responsabilidade do `versions.tf`/tag de imagem no momento da implementação |
| Volume de tráfego esperado em produção real | Sem número no repositório; assumido como volume de demo/MVP (ver Suposições) — sustenta a escolha de orquestração serverless |
| Variável `MAX_TURNS_ENSINO` ausente do `.env.example` | Não é uma variável de infraestrutura (regra de negócio do agente); apenas registrada aqui para rastreabilidade, não afeta o Terraform |

Nenhuma dessas lacunas invalida as decisões de arquitetura da Fase 2.

---

## Fase 2 — Decisões de arquitetura, por nuvem

### 2.0 Decisão transversal confirmada com a usuária

- **Orquestração**: serverless (não cluster gerenciado) nas duas nuvens — decisão
  definitiva desta rodada, confirmada explicitamente. Motivo: o MVP tem 2 workloads
  stateless, sem autoscaling definido, sem fila/cache, volume de "dezenas de sessões"
  (`docs/0001-plano-mvp-seniorlab.md:16`). OKE/GKE ficam registrados como alternativa
  descartada em cada ADR abaixo.
- **Exposição do backend**: privado, acessível só através do mesmo load
  balancer/domínio do frontend — não replica a porta pública 3000 do Compose. Confirmado
  com a usuária para simplificar rede e IAM (um único ponto de entrada público).
- **Domínio**: ainda não existe. Ambas as raízes recebem `domain_name` como variável
  obrigatória; o `apply` completa mesmo sem domínio real (o LB/serviço sobe com IP), mas
  o certificado gerenciado fica pendente de validação de domínio até que um seja
  informado.

### 2.1 ADR — OCI

#### ADR-OCI-01: Orquestração de containers
- **Contexto**: 2 workloads stateless, baixo tráfego esperado (demo/MVP), sem
  autoscaling por métrica definido no repositório.
- **Decisão**: OCI Container Instances (serverless) para `backend` e `frontend`.
- **Alternativa descartada**: OKE (Kubernetes gerenciado) — custo e tempo de
  provisionamento de control plane + node pool não se justificam para 2 containers sem
  necessidade de orquestração de pods, HPA ou service mesh.
- **Consequência**: sem Kubernetes nesta rodada; se o produto crescer para múltiplos
  serviços com necessidade de autoscaling fino, a migração para OKE é um novo ADR, não
  uma alteração incremental deste.

#### ADR-OCI-02: Rede
- **Contexto**: banco deve ficar inacessível pela internet; backend não deve ser exposto
  diretamente (decisão 2.0); egress HTTPS é obrigatório para `api.anthropic.com`.
- **Decisão**: 1 VCN com subnet pública (só o Load Balancer) e subnet privada
  (Container Instances de `backend`/`frontend` e o banco gerenciado); Internet Gateway na
  subnet pública; NAT Gateway na subnet privada para o egress do `backend`.
- **Alternativa descartada**: colocar tudo em subnet pública — rejeitado por expor
  desnecessariamente banco e backend a IP público direto.
- **Consequência**: todo tráfego externo passa pelo Load Balancer; NAT Gateway é um custo
  fixo adicional, mas necessário para o egress do `backend` sem expô-lo publicamente.

#### ADR-OCI-03: Registry de imagens
- **Decisão**: OCIR (OCI Registry), um repositório por imagem (`backend`, `frontend`).
- **Consequência**: `kustomize edit set image`/pipeline de CI (fora de escopo aqui) aponta
  para `<region>.ocir.io/<namespace>/seniorlab-backend` e `...-frontend`.

#### ADR-OCI-04: Serviços stateful
- **Decisão**: PostgreSQL via **OCI Database with PostgreSQL** (gerenciado), não dentro
  de um Container Instance.
- **Alternativa descartada**: Postgres em um Container Instance com volume — descartado
  porque perde backup automatizado, patching gerenciado e HA que o serviço gerenciado
  oferece, sem economia relevante de custo no volume desta demo.
- **Consequência**: banco fica na subnet privada, acessível só pelo `backend` via
  Network Security Group dedicado.

#### ADR-OCI-05: Segredos
- **Decisão**: OCI Vault com 2 secrets — `anthropic-api-key` e `postgres-credentials`
  (usuário+senha, ou `DATABASE_URL` completo). Policy de leitura restrita ao Dynamic
  Group que casa com os Container Instances da carga de trabalho.
- **Consequência**: nenhuma credencial em variável de ambiente em texto plano no
  Container Instance — o runtime lê do Vault na inicialização.

#### ADR-OCI-06: Exposição, TLS e DNS
- **Decisão**: OCI Load Balancer público na frente do `frontend`; roteamento de
  `/api/*` para o `backend` privado (mesmo LB, listener HTTP/HTTPS com regra de path);
  certificado via OCI Certificates associado ao `domain_name`; zona OCI DNS criada
  condicionalmente a um domínio real ser informado.
- **Consequência**: um único IP/hostname público; sem certificado válido até que
  `domain_name` aponte para o LB (documentado como pendência, não bloqueio de `apply`).

#### ADR-OCI-07: IAM
- **Decisão**: Dynamic Group definido por matching rule sobre os Container Instances +
  Policy de menor privilégio (`read secret-bundles`, `use repos` no compartment da carga
  de trabalho).
- **Consequência**: sem credenciais estáticas na carga de trabalho; segue o modelo
  dynamic group + policy nativo da OCI.

#### ADR-OCI-08: State remoto
- **Decisão**: backend S3-compatible da OCI Object Storage, bucket dedicado
  `seniorlab-oci-tfstate`, sem versionamento cruzado com GCP.

#### ADR-OCI-09: Custo
- **Estimativa de ordem de grandeza**: baixa — VCN e parte do Object Storage são
  elegíveis ao Always Free; Container Instances e OCI Database with PostgreSQL são
  cobrados por uso/tamanho de shape. Pode ser zerado fora de demo parando o banco
  gerenciado e os Container Instances (não há custo fixo de control plane, diferente de
  OKE).

### 2.2 ADR — GCP

#### ADR-GCP-01: Orquestração de containers
- **Contexto**: mesmo cenário da OCI — 2 workloads stateless, baixo tráfego.
- **Decisão**: Cloud Run (serverless) para `backend` e `frontend`.
- **Alternativa descartada**: GKE Autopilot — mesmo raciocínio de custo/complexidade vs.
  benefício nulo para este estágio.
- **Consequência**: sem Kubernetes; Cloud Run gerencia TLS, scaling para zero e
  revisões automaticamente.

#### ADR-GCP-02: Rede
- **Contexto**: Cloud Run não vive nativamente dentro de uma VPC; o banco precisa ficar
  em IP privado.
- **Decisão**: 1 VPC + subnet; Serverless VPC Access connector ligando o Cloud Run do
  `backend` à VPC (para alcançar o Cloud SQL por IP privado); Cloud NAT na VPC para
  egress explícito e previsível do `backend` até `api.anthropic.com`.
- **Alternativa descartada**: Cloud SQL com IP público + Cloud SQL Auth Proxy sem VPC —
  descartado por expor o banco à internet (mesmo que autenticado), contra o requisito de
  segmentação da Fase 1.
- **Consequência**: o connector Serverless VPC Access é um recurso adicional específico
  do paradigma serverless do GCP, sem equivalente direto na OCI (lá o Container Instance
  já vive nativamente na VCN).

#### ADR-GCP-03: Registry de imagens
- **Decisão**: Artifact Registry, um repositório Docker por imagem.

#### ADR-GCP-04: Serviços stateful
- **Decisão**: Cloud SQL for PostgreSQL 16, instância com IP privado (via VPC peering
  gerenciado pelo próprio Cloud SQL).
- **Alternativa descartada**: Postgres em contêiner no próprio Cloud Run — inviável,
  Cloud Run é stateless e não sustenta volume persistente entre revisões.
- **Consequência**: custo permanente mais significativo da conta GCP; mitigado
  desligando a instância fora de demo.

#### ADR-GCP-05: Segredos
- **Decisão**: Secret Manager, 2 secrets (`anthropic-api-key`, `postgres-credentials`),
  IAM binding `roles/secretmanager.secretAccessor` só para a service account do Cloud Run
  do `backend`.

#### ADR-GCP-06: Exposição, TLS e DNS
- **Decisão**: Cloud Run do `frontend` como serviço público, com mapeamento de domínio
  customizado (`domain_name`) e certificado gerenciado automaticamente pelo Cloud Run;
  Cloud Run do `backend` configurado como **privado** (`--no-allow-unauthenticated` /
  ingress interno), só alcançável via chamada server-to-server a partir do `frontend`
  ou por um Load Balancer HTTP(S) externo com Serverless NEG apontando para ambos os
  serviços sob o mesmo domínio (recomendado, para manter "um único ponto de entrada").
- **Alternativa descartada**: expor os dois Cloud Run publicamente com URLs distintas —
  descartado pela decisão confirmada de manter o backend atrás de um único ponto de
  entrada.
- **Consequência**: TLS é nativo do Cloud Run/Load Balancer gerenciado pelo Google — não
  exige um recurso de certificado explícito como na OCI, mas ainda depende de
  `domain_name` real para o mapeamento de domínio funcionar; sem domínio, o serviço fica
  acessível pela URL padrão `*.run.app` do Cloud Run.

#### ADR-GCP-07: IAM
- **Decisão**: uma Service Account dedicada por serviço Cloud Run (`backend`,
  `frontend`), com IAM bindings mínimos (`secretAccessor` no `backend`; `cloudsql.client`
  no `backend`). Sem Workload Identity Federation nesta rodada (não há workload rodando
  fora do GCP que precise assumir essa identidade) — Workload Identity clássico (GKE) não
  se aplica a Cloud Run puro.
- **Consequência**: modelo de IAM binding direto, mais simples que dynamic group da OCI,
  mas sem o conceito de "matching rule" — cada revisão do Cloud Run herda a SA
  configurada no serviço.

#### ADR-GCP-08: State remoto
- **Decisão**: bucket GCS dedicado `seniorlab-gcp-tfstate`, sem relação com o bucket OCI.

#### ADR-GCP-09: Custo
- **Estimativa de ordem de grandeza**: baixa — Cloud Run tem free tier de 2 milhões de
  requisições/mês, cobre a demo com folga. Cloud SQL (menor tier, `db-f1-micro` ou
  equivalente) é o custo fixo mais relevante; recomendável parar a instância fora de
  demo para zerar esse custo.

### 2.3 Onde os paradigmas divergem (sem forçar simetria)

| Aspecto | OCI | GCP | Motivo da divergência |
|---|---|---|---|
| Unidade organizacional | Compartment | Project | Modelos de organização nativos distintos das duas nuvens |
| Identidade da carga de trabalho | Dynamic Group + Policy | Service Account + IAM binding | Sem equivalente 1:1; OCI usa matching rules sobre recursos, GCP usa binding direto na identidade |
| Acesso do compute à VPC | Nativo (Container Instance já vive na VCN) | Requer Serverless VPC Access connector | Cloud Run é executado fora da VPC por padrão |
| TLS | Recurso explícito (OCI Certificates + LB listener) | Nativo/gerenciado pelo Cloud Run | Cloud Run abstrai o LB e o certificado |
| Exposição do backend privado | NSG restringindo Load Balancer → backend na subnet privada | Ingress interno do Cloud Run + Serverless NEG atrás de um Load Balancer externo | Cloud Run privado exige uma camada de LB explícita para unificar com o frontend sob o mesmo domínio |

---

## Fase 3 — Estrutura de pastas e isolamento

```
infra/
  oci/
    main.tf                       # composição dos módulos (rede, registry, segredos, dados, compute)
    providers.tf                  # provider oci, versão pinada
    variables.tf                  # compartment_ocid, region, domain_name, tags, etc.
    outputs.tf                    # outputs do contrato da Fase 4
    backend.tf                    # backend S3-compatible apontando para OCI Object Storage
    versions.tf                   # required_version do Terraform + required_providers
    terraform.tfvars.example      # placeholders, incluindo domain_name: "seniorlab.exemplo.com"
    modules/
      rede/                       # VCN, subnets pública/privada, IG, NAT Gateway, NSGs
      registry/                   # OCIR + repositórios de imagem
      segredos/                   # OCI Vault + secrets + policy de leitura
      dados/                      # OCI Database with PostgreSQL
      compute/                    # Container Instances (backend, frontend) + Load Balancer + Dynamic Group
    README.md                     # pré-requisitos: tenancy, compartment existente, credenciais API OCI, limites de shape
  gcp/
    main.tf                       # composição dos módulos (rede, registry, segredos, dados, compute)
    providers.tf                  # provider google, versão pinada
    variables.tf                  # project_id, region, domain_name, tags/labels, etc.
    outputs.tf                    # outputs do contrato da Fase 4
    backend.tf                    # backend gcs
    versions.tf                   # required_version do Terraform + required_providers
    terraform.tfvars.example      # placeholders, incluindo domain_name: "seniorlab.exemplo.com"
    modules/
      rede/                       # VPC, subnet, Serverless VPC Access connector, Cloud NAT
      registry/                   # Artifact Registry
      segredos/                   # Secret Manager + secrets + IAM bindings
      dados/                      # Cloud SQL for PostgreSQL
      compute/                    # Cloud Run (backend, frontend) + Load Balancer externo + Service Accounts
    README.md                     # pré-requisitos: project existente, APIs a habilitar (run, sqladmin, secretmanager, vpcaccess, artifactregistry), billing account
```

### Restrições atendidas

- Cada pasta (`infra/oci`, `infra/gcp`) é uma raiz Terraform completa e aplicável
  sozinha: `cd infra/gcp && terraform apply` funciona sem que `infra/oci` jamais tenha
  sido executado, e vice-versa — nenhuma raiz referencia recursos ou outputs da outra.
- State remoto separado por nuvem (`ADR-OCI-08`, `ADR-GCP-08`); nenhum
  `terraform_remote_state` cruzado.
- Nenhum provider da outra nuvem declarado em cada raiz (`providers.tf` de `oci/` só
  declara `oci`; `providers.tf` de `gcp/` só declara `google`).
- Nenhum módulo compartilhado entre as duas — os módulos `rede/`, `segredos/`, `dados/`
  se parecem em propósito entre as pastas, mas são implementações totalmente
  independentes (recursos e providers distintos); a duplicação é intencional, exigida
  pelo isolamento das restrições não-negociáveis.
- `terraform destroy` em uma pasta não toca a outra — sem dependência de recurso ou de
  state entre elas.
- Convenção única de nomes/tags aplicada independentemente nas duas: prefixo
  `seniorlab-<ambiente>-<recurso>` como tag/label (`environment`, `project=seniorlab`,
  `managed-by=terraform`) em ambas as raízes.
- Versões pinadas em `versions.tf` de cada raiz: Terraform (`~> 1.9`), provider `oci`
  (versão exata a definir na implementação), provider `google` (idem), Postgres `16`.

---

## Fase 4 — Outputs e contrato com a etapa seguinte

Nomes idênticos nas duas raízes sempre que representam a mesma coisa:

| Output | OCI | GCP | Observação |
|---|---|---|---|
| `registry_url` | URL do OCIR (`<region>.ocir.io/<namespace>`) | URL do Artifact Registry | Idêntico em nome e forma |
| `registry_repository_backend` / `registry_repository_frontend` | nome do repositório OCIR | nome do repositório Artifact Registry | Idêntico |
| `workload_identity_backend` | nome do Dynamic Group | e-mail da Service Account do `backend` | Mesmo nome de output, valor tem forma diferente por paradigma (ver 2.3) |
| `database_endpoint` | endpoint privado do OCI Database with PostgreSQL | endpoint privado (IP) do Cloud SQL | Idêntico |
| `database_secret_name` | nome do secret no Vault | nome do secret no Secret Manager | Idêntico |
| `anthropic_secret_name` | nome do secret no Vault | nome do secret no Secret Manager | Idêntico |
| `service_url_frontend` | hostname/IP do Load Balancer OCI | domínio mapeado ou URL `*.run.app` do Cloud Run | Idêntico em nome; **impossível igualar a forma** — um é IP/hostname de LB, outro é URL gerenciada. Documentado como divergência aceita |
| `vpc_id` | OCID da VCN | ID da VPC | Idêntico em nome |

Onde a igualdade de nome não é possível (`service_url_frontend`), a etapa seguinte de
manifestos precisa tratar o valor como uma URL genérica em ambos os casos — a diferença
de forma (IP vs. hostname gerenciado) é inerente ao paradigma serverless do GCP e não é
escondida, apenas documentada.

---

## Fase 5 — Execução e comparação

### 5.1 Sequência por raiz

Ambas seguem `terraform init → terraform plan → terraform apply`, isoladamente, cada uma
com seus pré-requisitos (credenciais da respectiva nuvem configuradas, compartment/project
já existente, `terraform.tfvars` preenchido a partir do `.example`).

| Etapa | OCI | GCP |
|---|---|---|
| Pré-requisito de credencial | API Signing Key + tenancy/user/fingerprint OCIDs | Service Account key ou ADC (`gcloud auth application-default login`) |
| APIs/limites a habilitar antes do `apply` | Limites de shape de Container Instances no compartment | Habilitar `run.googleapis.com`, `sqladmin.googleapis.com`, `secretmanager.googleapis.com`, `vpcaccess.googleapis.com`, `artifactregistry.googleapis.com` |
| Tempo estimado de provisionamento | ~15–25 min (Load Balancer e OCI Database with PostgreSQL são os itens mais lentos) | ~10–20 min (Cloud SQL é o item mais lento; Cloud Run sobe em segundos) |

### 5.2 Validação pós-apply

- Confirmar `terraform output service_url_frontend` responde HTTP 200/301.
- Confirmar conectividade privada do `backend` ao banco (log de boot sem erro de conexão
  — o próprio `/health` do backend já valida isso, ver `backend/src/index.ts:35`).
- Confirmar que o secret da chave Anthropic é legível só pela identidade da carga de
  trabalho (tentar leitura com outra identidade deve falhar).

### 5.3 Destruição e reversão

`terraform destroy` isolado por pasta; como não há dependência cruzada (Fase 3), destruir
uma nuvem nunca afeta a outra. Ordem interna de destroy é resolvida automaticamente pelo
grafo de dependências do Terraform dentro de cada raiz.

### 5.4 Quadro comparativo OCI × GCP

| Critério | OCI | GCP |
|---|---|---|
| Custo estimado (demo, uso leve) | Baixo — parte da rede e storage no Always Free | Baixo — Cloud Run com free tier generoso; Cloud SQL é o custo fixo |
| Tempo de provisionamento | Médio (~15–25 min) | Médio-baixo (~10–20 min) |
| Complexidade de credenciais | Maior fricção inicial (API Signing Key, múltiplos OCIDs) | Mais simples com ADC/gcloud |
| Maturidade do provider Terraform | Provider `oci` oficial, менos usado que hyperscalers tradicionais, mas ativo | Provider `google`/`google-beta` muito maduro e amplamente usado |
| Free tier aplicável | Always Free cobre VCN, parte de Object Storage e um shape mínimo de compute | Cloud Run free tier (2M req/mês); Cloud SQL não tem free tier permanente |
| Riscos | Menor familiaridade geral do ecossistema; Container Instances é um serviço mais novo | Cloud SQL é o único ponto sem "scale to zero"; custo fixo mesmo parado a menos que a instância seja explicitamente parada |

**Recomendação explícita**: GCP, pelo critério de **menor fricção de credenciais e
maturidade do provider Terraform** — para um time que ainda não escolheu a nuvem e quer
minimizar tempo de setup e risco de bugs de provider, esse é o critério mais decisivo no
estágio de MVP. Esta recomendação não torna o plano dependente dela: as duas raízes são
igualmente completas e aplicáveis.

---

## Suposições

- Volume de uso é o de uma demo/MVP (dezenas de sessões), não produção com usuários reais
  concorrentes — sustenta a escolha de orquestração serverless nas duas nuvens.
- A inconsistência de `ANTHROPIC_MODEL` default entre `client.ts:10` e `health.ts:24` é
  uma pendência de código da aplicação, não tratada por este plano de infraestrutura.

## Perguntas Abertas

- Nenhuma pergunta bloqueante restante: as três decisões que dependiam de input da
  usuária (exposição do backend, domínio, orquestração serverless vs. cluster) já foram
  confirmadas e estão registradas na Fase 2.0.
- Fica em aberto, para uma rodada futura: se/quando um domínio real for definido, qual
  provedor de DNS será usado (gerenciado pela própria nuvem ou externo) — isso não afeta
  a estrutura Terraform proposta aqui, só o valor de `domain_name` e se a zona DNS é
  criada dentro da raiz ou já existe fora dela.
