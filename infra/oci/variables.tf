variable "tenancy_ocid" {
  description = "OCID da tenancy OCI."
  type        = string
}

variable "user_ocid" {
  description = "OCID do usuário usado para autenticação via API Signing Key."
  type        = string
}

variable "fingerprint" {
  description = "Fingerprint da API Signing Key do usuário."
  type        = string
}

variable "private_key_path" {
  description = "Caminho local da chave privada da API Signing Key."
  type        = string
}

variable "private_key_password" {
  description = "Senha (passphrase) da chave privada da API Signing Key, se ela tiver sido gerada com uma. Deixe vazio se a chave não tiver senha."
  type        = string
  sensitive   = true
  default     = ""
}

variable "region" {
  description = "Região OCI onde os recursos serão provisionados (ex.: sa-saopaulo-1)."
  type        = string
}

variable "compartment_ocid" {
  description = "OCID do compartment já existente onde a carga de trabalho será criada."
  type        = string
}

variable "environment" {
  description = "Nome do ambiente, usado em tags e nomes de recursos (ex.: demo, dev, prod)."
  type        = string
  default     = "demo"
}

variable "domain_name" {
  description = <<-EOT
    Domínio público para o frontend (ex.: seniorlab.exemplo.com). Obrigatório, mas o
    apply completa mesmo sem um domínio real registrado — o certificado gerenciado fica
    pendente de validação até que o DNS aponte para o Load Balancer.
  EOT
  type        = string
}

variable "anthropic_api_key" {
  description = "Chave da API Anthropic (ANTHROPIC_API_KEY). Armazenada só no OCI Vault."
  type        = string
  sensitive   = true
}

variable "anthropic_model" {
  description = "Modelo da API Anthropic (ANTHROPIC_MODEL)."
  type        = string
  default     = "claude-haiku-4-5-20251001"
}

variable "postgres_user" {
  description = "Usuário do banco PostgreSQL."
  type        = string
  default     = "seniorlab"
}

variable "postgres_password" {
  description = "Senha do usuário do banco PostgreSQL. Armazenada só no OCI Vault."
  type        = string
  sensitive   = true
}

variable "postgres_db" {
  description = "Nome do banco de dados PostgreSQL."
  type        = string
  default     = "seniorlab"
}

variable "postgres_db_version" {
  description = "Versão major do PostgreSQL gerenciado."
  type        = string
  default     = "16"
}

variable "backend_image" {
  description = "Referência completa da imagem de produção do backend no OCIR (preenchida pelo CI/CD, fora de escopo deste Terraform)."
  type        = string
  default     = ""
}

variable "frontend_image" {
  description = "Referência completa da imagem de produção do frontend no OCIR (preenchida pelo CI/CD, fora de escopo deste Terraform)."
  type        = string
  default     = ""
}

variable "freeform_tags" {
  description = "Tags adicionais aplicadas a todos os recursos, além das tags padrão do projeto."
  type        = map(string)
  default     = {}
}
