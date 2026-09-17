# SeniorLab — infraestrutura OCI

Raiz Terraform independente para provisionar o SeniorLab na Oracle Cloud Infrastructure.
Não depende de `infra/gcp` nem é dependida por ela — pode ser aplicada e destruída
isoladamente.

Decisões de arquitetura: ver `docs/plan/infra-terraform-seniorlab.md`, seção 2.1
(ADR-OCI-01 a 09).

## Pré-requisitos

1. Tenancy OCI e um **compartment já existente** onde a carga de trabalho será criada.
2. API Signing Key configurada para um usuário com permissão de administrar o
   compartment (tenancy OCID, user OCID, fingerprint e chave privada).
3. Bucket de Object Storage `seniorlab-oci-tfstate` já criado, para o backend remoto
   (compatível com S3, ver `backend.tf`).
4. Limite de shape de **Container Instances** habilitado no compartment/região alvo.
5. Terraform `~> 1.9` instalado.

## Uso

```bash
cp terraform.tfvars.example terraform.tfvars
# preencher terraform.tfvars com valores reais (não versionar)

terraform init
terraform plan
terraform apply
```

## Notas

- `domain_name` é obrigatório, mas o `apply` completa mesmo sem um domínio real
  registrado — o certificado gerenciado (OCI Certificates) fica pendente de validação
  até que o DNS aponte para o hostname do Load Balancer (`service_url_frontend`).
- Nenhuma credencial (chave Anthropic, credenciais do Postgres) é gravada em texto
  plano em variável de ambiente do Container Instance — tudo é lido do OCI Vault em
  runtime pela identidade do Dynamic Group.
- `terraform destroy` remove só os recursos desta pasta; não há dependência com
  `infra/gcp`.
