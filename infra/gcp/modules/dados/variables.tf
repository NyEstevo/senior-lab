variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "name_prefix" {
  type = string
}

variable "network_id" {
  type = string
}

variable "private_vpc_connection" {
  description = "ID da conexão de peering privado (usado só para ordenar o apply após o peering existir)."
  type        = string
}

variable "postgres_db" {
  type = string
}

variable "postgres_user" {
  type = string
}

variable "postgres_password" {
  type      = string
  sensitive = true
}

variable "db_version" {
  type    = string
  default = "POSTGRES_16"
}

variable "tier" {
  description = "Tier do Cloud SQL (menor tier para demo/MVP)."
  type        = string
  default     = "db-f1-micro"
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "labels" {
  type    = map(string)
  default = {}
}
