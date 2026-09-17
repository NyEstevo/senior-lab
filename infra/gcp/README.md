# SeniorLab — infraestrutura GCP

Raiz Terraform independente para provisionar o SeniorLab no Google Cloud Platform. Não
depende de `infra/oci` nem é dependida por ela — pode ser aplicada e destruída
isoladamente.

Decisões de arquitetura: ver `docs/plan/infra-terraform-seniorlab.md`, seção 2.2
(ADR-GCP-01 a 09).

## Pré-requisitos

1. Projeto GCP já existente, com billing account vinculada.
2. Credenciais configuradas via Application Default Credentials
   (`gcloud auth application-default login`) ou uma Service Account key.
3. Bucket GCS `seniorlab-gcp-tfstate` já criado, para o backend remoto.
4. Terraform `~> 1.9` instalado.

As APIs necessárias (`run`, `sqladmin`, `secretmanager`, `vpcaccess`,
`artifactregistry`, `compute`) são habilitadas pelo próprio Terraform
(`google_project_service` em `main.tf`).

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
  registrado — sem domínio, o frontend fica acessível pela URL padrão `*.run.app` do
  Cloud Run.
- O backend do Cloud Run é privado (`ingress = "internal-and-cloud-load-balancing"`),
  só alcançável através do Load Balancer externo que também serve o frontend sob o
  mesmo domínio — mantendo um único ponto de entrada público (ADR-GCP-06).
- Nenhuma credencial (chave Anthropic, credenciais do Postgres) é gravada em texto
  plano em variável de ambiente do Cloud Run — tudo é lido do Secret Manager via
  `secret_key_ref`, resolvido pela Service Account do serviço.
- `terraform destroy` remove só os recursos desta pasta; não há dependência com
  `infra/oci`.
