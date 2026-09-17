variable "project_id" {
  description = "ID do projeto GCP já existente onde a carga de trabalho será criada."
  type        = string
}

variable "region" {
  description = "Região GCP onde os recursos serão provisionados (ex.: southamerica-east1)."
  type        = string
  default     = "southamerica-east1"
}

variable "environment" {
  description = "Nome do ambiente, usado em labels e nomes de recursos (ex.: demo, dev, prod)."
  type        = string
  default     = "demo"
}

variable "domain_name" {
  description = <<-EOT
    Domínio público para o frontend (ex.: seniorlab.exemplo.com). Obrigatório, mas o
    apply completa mesmo sem um domínio real registrado — sem domínio, o serviço fica
    acessível pela URL padrão *.run.app do Cloud Run.
  EOT
  type        = string
}

variable "anthropic_api_key" {
  description = "Chave da API Anthropic (ANTHROPIC_API_KEY). Armazenada só no Secret Manager."
  type        = string
  sensitive   = true
}

variable "postgres_user" {
  description = "Usuário do banco PostgreSQL."
  type        = string
  default     = "seniorlab"
}

variable "postgres_password" {
  description = "Senha do usuário do banco PostgreSQL. Armazenada só no Secret Manager."
  type        = string
  sensitive   = true
}

variable "postgres_db" {
  description = "Nome do banco de dados PostgreSQL."
  type        = string
  default     = "seniorlab"
}

variable "postgres_db_version" {
  description = "Versão major do PostgreSQL gerenciado no Cloud SQL."
  type        = string
  default     = "POSTGRES_16"
}

variable "backend_image" {
  description = "Referência completa da imagem de produção do backend no Artifact Registry (preenchida pelo CI/CD, fora de escopo deste Terraform)."
  type        = string
  default     = ""
}

variable "frontend_image" {
  description = "Referência completa da imagem de produção do frontend no Artifact Registry (preenchida pelo CI/CD, fora de escopo deste Terraform)."
  type        = string
  default     = ""
}

variable "labels" {
  description = "Labels adicionais aplicadas a todos os recursos, além das labels padrão do projeto."
  type        = map(string)
  default     = {}
}
