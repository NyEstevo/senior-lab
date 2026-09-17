variable "compartment_ocid" {
  type = string
}

variable "name_prefix" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "nsg_id" {
  type = string
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
  default = "16"
}

variable "container_shape" {
  description = "Shape do Container Instance rodando o Postgres temporário."
  type        = string
  default     = "CI.Standard.E4.Flex"
}

variable "freeform_tags" {
  type    = map(string)
  default = {}
}
