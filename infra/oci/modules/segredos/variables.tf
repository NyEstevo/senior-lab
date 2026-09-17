variable "compartment_ocid" {
  type = string
}

variable "name_prefix" {
  type = string
}

variable "anthropic_api_key" {
  type      = string
  sensitive = true
}

variable "database_url" {
  description = "DATABASE_URL composta (usuário+senha+endpoint), guardada como um único secret."
  type        = string
  sensitive   = true
}

variable "freeform_tags" {
  type    = map(string)
  default = {}
}
