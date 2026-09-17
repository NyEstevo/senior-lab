# Passo a passo — subir o SeniorLab na OCI

Guia prático para provisionar esta raiz Terraform (`infra/oci`) numa tenancy OCI real.
Decisões de arquitetura: ver `docs/plan/infra-terraform-seniorlab.md` (ADR-OCI-01 a 09).

Este documento reflete o que funcionou de fato numa implantação real — incluindo os
desvios do plano original, que estão sinalizados ao longo do texto e resumidos no final.

---

## 1. Pré-requisitos de conta

1. Tenancy OCI e um **compartment vazio e dedicado** para o SeniorLab (anote o
   `compartment_ocid`). Use um compartment novo: se um `apply` anterior falhou pela
   metade, sobram recursos órfãos que colidem com os novos.
2. Um usuário com permissão de administrar esse compartment.
3. Limite de shape de **Container Instances** habilitado no compartment/região alvo.

## 2. Instalar as ferramentas locais

```bash
# Terraform >= 1.12 (obrigatório: o backend nativo oci só existe a partir dessa versão)
terraform -version

# OCI CLI
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
oci --version
```

## 3. Gerar a API Signing Key e configurar o OCI CLI

```bash
oci setup config
```

Ao final ele mostra o **fingerprint** e onde salvou a chave privada. Confira os quatro
pontos abaixo — cada um deles custou um ciclo de depuração numa implantação real:

- O config precisa ficar em `~/.oci/config`. Se o assistente mostrar outro caminho
  (ele pergunta, e é fácil responder com o nome da região por engano), mova:
  `mv <caminho-errado> ~/.oci/config`.
- Todo OCID começa com `ocid1.` — confira que o campo `user=` não perdeu caracteres.
- Se você deu **passphrase** à chave, adicione `pass_phrase=<sua-senha>` no
  `~/.oci/config`. O CLI contorna perguntando interativamente, mas o **backend do
  Terraform não tem como perguntar** e falha com `did not find a proper configuration
  for private key`.
- Permissões restritas: `chmod 700 ~/.oci && chmod 600 ~/.oci/config ~/.oci/*.pem`.

### Subir a chave pública no Console

1. Console OCI → ícone de perfil → **My profile** → aba **API keys** → **Add API key**
2. **Paste public key** → cole o conteúdo do arquivo `*_public.pem` gerado
3. Confirme que o fingerprint exibido bate com o do `~/.oci/config`

Teste com `oci iam region list`. Um `401 NotAuthenticated` aqui quase sempre significa
que a chave pública ainda não foi adicionada no Console.

## 4. Criar o bucket do state remoto

O `backend.tf` usa o **backend nativo `oci`** (Terraform 1.12+). O bucket precisa existir
antes do `terraform init` — o Terraform não pode gerenciar o bucket que guarda o próprio
state.

```bash
oci os bucket create --compartment-id <compartment_ocid> --name <nome-do-bucket>
oci os ns get --query data --raw-output   # namespace, usado no backend.tf
```

Ajuste `bucket`, `namespace` e `region` no `backend.tf`. A autenticação usa o mesmo
perfil do `~/.oci/config` do passo 3 — **não é necessária Customer Secret Key nem
variáveis `AWS_*`**.

> **Por que não o backend `s3`:** a Oracle marca o backend S3-compatible como deprecated,
> e ele quebra na prática. O AWS SDK v2 (usado pelo Terraform 1.6+) envia checksums em
> `aws-chunked` encoding, que a OCI rejeita com `501 NotImplemented: AWS chunked encoding
> not supported` na hora de gravar o state — depois de já ter criado recursos, deixando
> um `errored.tfstate` para recuperar à mão. As variáveis
> `AWS_REQUEST_CHECKSUM_CALCULATION`/`AWS_RESPONSE_CHECKSUM_VALIDATION` mitigam só parte
> do problema. Use o backend nativo.

## 5. Preencher as variáveis

```bash
cp terraform.tfvars.example terraform.tfvars
```

- `tenancy_ocid`, `user_ocid`, `fingerprint`, `private_key_path` (o mesmo `.pem` do
  passo 3 — atenção se você gerou mais de uma chave).
- `private_key_password`: a passphrase da chave, ou `""` se não tiver.
- `region`, `compartment_ocid`.
- `domain_name`: pode ser placeholder (`seniorlab.exemplo.com`) — o `apply` completa
  sem domínio real (ver seção 9).
- `anthropic_api_key`, `postgres_password`: segredos reais. **Nunca versione este
  arquivo** (já está no `.gitignore`).
- `anthropic_model`: use um ID de modelo válido, **sem sufixo de data** (ex.:
  `claude-sonnet-5`, `claude-opus-5`, `claude-haiku-4-5`). Um ID inválido não quebra o
  `apply`, mas o backend loga `verificação da chave Anthropic inconclusiva: 404` e o
  agente falha em runtime.
- `backend_image`/`frontend_image`: preencha depois do passo 7, com **tag versionada**
  (`:1.0`, `:1.1`…), nunca `:latest` — ver o aviso no passo 8.

## 6. Primeiro apply — infraestrutura de suporte

As imagens ainda não existem no OCIR, então aplique primeiro o que não depende delas:

```bash
terraform init
terraform apply -target=module.rede -target=module.registry -target=module.segredos -target=module.dados
```

`-target` aqui é um bootstrap pontual e justificado (o push de imagem precisa do registry
existir antes) — não é para uso rotineiro depois disso.

## 7. Build e push das imagens

```bash
terraform output registry_url   # ex.: gru.ocir.io/<namespace>
```

O login usa um **Auth Token**, que não é a senha do console nem a API Signing Key:
Console → perfil → **My profile** → **Auth tokens** → *Generate token* (exibido uma única
vez). O usuário inclui o namespace e, em tenancies com identity domain, o nome do domínio:

```bash
# sem identity domain:  <namespace>/<usuario>
# com identity domain:  <namespace>/<dominio>/<usuario>     (descubra com: oci iam domain list --compartment-id <tenancy_ocid>)
docker login gru.ocir.io

cd ~/personal/senior-lab
docker build -t gru.ocir.io/<namespace>/seniorlab-demo-backend:1.0  --target prod ./backend
docker push  gru.ocir.io/<namespace>/seniorlab-demo-backend:1.0
docker build -t gru.ocir.io/<namespace>/seniorlab-demo-frontend:1.0 --target prod ./frontend
docker push  gru.ocir.io/<namespace>/seniorlab-demo-frontend:1.0

# conferir (image-count deve ser >= 1 nos dois)
oci artifacts container repository list --compartment-id <compartment_ocid> --all \
  --query 'data.items[*].{name:"display-name",images:"image-count"}' --output table
```

## 8. Apply completo

Preencha `backend_image`/`frontend_image` no `terraform.tfvars` com as tags do passo
anterior e rode:

```bash
terraform apply
```

> **Use tags versionadas, não `:latest`.** Com `:latest`, o `image_url` não muda entre
> deploys e o Terraform reporta "no changes" — o container continua rodando a imagem
> antiga silenciosamente. Ou você versiona a tag (recomendado: o Terraform detecta a
> mudança sozinho e você ganha rollback), ou precisa forçar a cada deploy com
> `terraform apply -replace=module.compute.oci_container_instances_container_instance.frontend`.

Isso cria os Container Instances, o Dynamic Group, e as peças do Load Balancer que
dependem dos IPs privados dos containers.

## 9. Apontar o domínio (quando tiver um)

```bash
terraform output service_url_frontend
```

Crie um registro DNS `A` apontando para esse IP. Sem domínio real o serviço funciona pelo
IP, apenas com certificado **autoassinado** (o navegador avisa; use `curl -k`).

## 10. Validar

```bash
IP=$(terraform output -raw service_url_frontend)
curl -sk -o /dev/null -w "%{http_code}\n" https://$IP/          # frontend -> 200
curl -sk https://$IP/api/trilhas                                 # API -> JSON com dados
```

`/api/trilhas` retornando dados prova a cadeia inteira: backend no ar, secrets lidos do
Vault, Postgres conectado, migrações e seed aplicados.

Saúde dos backends no Load Balancer:

```bash
oci lb backend-set-health get --load-balancer-id <lb_ocid> --backend-set-name seniorlab-demo-bs-backend
```

> `curl https://$IP/health` retorna **404 por design**, não é falha: o LB só roteia
> `/api/*` para o backend; `/health` na raiz cai no nginx do frontend. O health check do
> LB bate direto no container, na porta 3000.

Para depurar um container que não sobe:

```bash
oci container-instances container list --compartment-id <compartment_ocid> --all \
  --query 'data.items[?"lifecycle-state"!=`DELETED`].{name:"display-name",id:id}' --output table
oci container-instances container retrieve-logs --container-id <id> --file -
```

## 11. Destruir

```bash
terraform destroy
```

Remove só os recursos desta pasta — não afeta `infra/gcp`, que é independente.

---

## Desvios do plano original

### Postgres em Container Instance, não gerenciado (temporário)

Contas Trial/Free Tier costumam ter o serviço **OCI Database with PostgreSQL** com limite
`0` (`400-LimitExceeded: dbsystem-count`) até pedir aumento ou migrar para Pay As You Go
(Console → **Governance & Administration → Limits, Quotas and Usage**).

Enquanto isso, o módulo `dados` roda o Postgres num Container Instance com imagem pública
`postgres:16-alpine`, em vez do `oci_psql_db_system` do `ADR-OCI-04`. Consequências:

- **Sem backup automático, sem patching gerenciado, sem alta disponibilidade.**
- Container Instances só suportam volume `EMPTYDIR` (efêmero) — **não existe volume
  persistente de rede nesse serviço**. Os dados somem se o container reiniciar.
- Foi preciso liberar egress HTTPS no NSG do banco (`db_egress_https_temp` em
  `modules/rede/main.tf`) para puxar a imagem do Docker Hub.

Para reverter quando a cota for liberada: restaure o `oci_psql_db_system` (histórico do
repositório ou `ADR-OCI-04`) e remova a regra `db_egress_https_temp`. A interface do
módulo (`subnet_id`, `nsg_id`, outputs `db_private_endpoint`/`db_system_id`) foi mantida
igual de propósito — nada mais na árvore precisa mudar.

### Certificado autoassinado

O `ADR-OCI-06` previa certificado gerenciado pelo OCI Certificates. Na prática, esse
serviço só emite a partir de uma **CA interna própria** (`config_type` aceita apenas
`ISSUED_BY_INTERNAL_CA` / `MANAGED_EXTERNALLY_ISSUED_BY_INTERNAL_CA`) — não faz emissão
pública via ACME como o Google Managed Certificate. Montar uma CA interna era escopo bem
maior que o MVP.

A solução atual gera um certificado autoassinado com o provider `tls` e o instala via
`oci_load_balancer_certificate` (recurso clássico do LB). Quando houver domínio real,
troque por um certificado de verdade — a arquitetura não muda.

### Secrets: como o backend lê do Vault

O `ADR-OCI-05` exige que nenhuma credencial fique em variável de ambiente em texto plano.
A aplicação, porém, só sabia ler `process.env`. Foi implementado em
`backend/src/secrets/vault.ts`: no boot, o backend lê os secrets do Vault autenticando
pelo **resource principal** do próprio Container Instance — sem credencial estática.

O Terraform passa só os OCIDs dos secrets (`DATABASE_SECRET_OCID`,
`ANTHROPIC_SECRET_OCID`), que não são sigilosos. A autorização vem da policy do Dynamic
Group (`read secret-bundles`). Em desenvolvimento local, sem essas variáveis, o carregador
não faz nada e o `.env` continua valendo.

O entrypoint de produção é `dist/bootstrap.js`, não `dist/index.js`: os secrets precisam
estar no `process.env` **antes** de `db.ts` ser importado, porque o pool do Postgres é
criado no momento do import. Por isso o bootstrap usa import dinâmico.

---

## Erros encontrados e a causa real

| Sintoma | Causa | Correção |
|---|---|---|
| `401 NotAuthenticated` no `oci` CLI | Chave pública não subida no Console | Subir em *My profile → API keys* |
| `did not find a proper configuration for private key` | Chave tem passphrase, e nem o `terraform.tfvars` nem o `~/.oci/config` a informavam | `private_key_password` no tfvars (provider) e `pass_phrase` no `~/.oci/config` (backend) |
| `Provider registry.terraform.io/hashicorp/oci requires explicit configuration` | Terraform 1.16 não herdou o `required_providers` do root nos módulos filhos, resolvendo `oci` para o namespace legado | Declarar `required_providers` explicitamente no `versions.tf` de **cada** módulo |
| `SignatureDoesNotMatch` no backend `s3`, mesmo com `aws s3 ls` funcionando | Checksums do AWS SDK v2 | Mitigado por `AWS_*_CHECKSUM_*`; resolvido de vez migrando para o backend nativo `oci` |
| `501 NotImplemented: AWS chunked encoding not supported` ao gravar o state | Idem, na gravação | Backend nativo `oci` |
| `400-LimitExceeded: dbsystem-count` | Conta Trial sem cota de PostgreSQL gerenciado | Ver "Desvios" acima |
| `409-NAMESPACE_CONFLICT, Repository already exists` | Nome de repositório OCIR é único **por tenancy**, não por compartment — trocar de compartment não resolve | `terraform import` do repositório existente |
| `Dynamic group can only be created in the tenancy compartment` | Regra da OCI | `compartment_id = var.tenancy_ocid` no `oci_identity_dynamic_group` |
| `expected certificate_config.0.config_type to be one of [...]` | OCI Certificates não faz emissão pública | Certificado autoassinado via provider `tls` |
| `expected backup_policy.0.kind to be one of ["DAILY" ...]` | Valor inexistente na API | `"DAILY"` |
| `Invalid container image urls` | `terraform.tfvars` ainda tinha o placeholder `<namespace>` | Preencher com a URL real |
| `image could not be pulled because the image does not exist` | Repositório com `image-count: 0` — o `apply` rodou antes do push | Buildar e enviar antes |
| `Work Request error ... action: DELETED` | Bug de leitura do work request no provider (estava 72 versões atrasado) — a exclusão **funciona** apesar do erro | Conferir o estado real no CLI; `terraform init -upgrade` |
| nginx: `mkdir() "/var/cache/nginx/client_temp" failed (13: Permission denied)` | `USER app` no Dockerfile; a imagem oficial precisa de root no master | Remover o `USER` (workers já baixam privilégio sozinhos) |
| `ECONNREFUSED 127.0.0.1:5432` | `DATABASE_URL` não chegava ao container | Leitura do Vault via resource principal |
| `relation "cenarios" does not exist` | `tsc` não copia arquivos não-TS: os `.sql` e os prompts `.txt` não iam para `dist/` | Script `copy:assets` no `package.json` |
| `verificação da chave Anthropic inconclusiva: 404` | ID de modelo inválido (IDs atuais não têm sufixo de data) | `claude-sonnet-5` / `claude-opus-5` / `claude-haiku-4-5` |
| Container rodando imagem antiga sem aviso | Tag `:latest` não muda o `image_url`, então o Terraform não detecta nada | Tags versionadas, ou `terraform apply -replace=...` |
