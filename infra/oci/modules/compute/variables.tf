variable "compartment_ocid" {
  type = string
}

variable "tenancy_ocid" {
  description = "Dynamic Groups só podem ser criados no compartment raiz da tenancy, nunca num compartment de trabalho."
  type        = string
}

variable "name_prefix" {
  type = string
}

variable "domain_name" {
  type = string
}

variable "public_subnet_id" {
  type = string
}

variable "private_subnet_id" {
  type = string
}

variable "backend_nsg_id" {
  type = string
}

variable "frontend_nsg_id" {
  type = string
}

variable "lb_nsg_id" {
  type = string
}

variable "backend_image" {
  type = string
}

variable "frontend_image" {
  type = string
}

variable "anthropic_model" {
  type = string
}

variable "vault_id" {
  type = string
}

variable "anthropic_secret_id" {
  type = string
}

variable "database_secret_id" {
  type = string
}

variable "container_shape" {
  description = "Shape do Container Instance (menor shape flexível para demo/MVP)."
  type        = string
  default     = "CI.Standard.E4.Flex"
}

variable "freeform_tags" {
  type    = map(string)
  default = {}
}
