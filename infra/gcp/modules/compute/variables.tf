variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "name_prefix" {
  type = string
}

variable "domain_name" {
  type = string
}

variable "network_id" {
  type = string
}

variable "vpc_connector_id" {
  type = string
}

variable "backend_image" {
  type = string
}

variable "frontend_image" {
  type = string
}

variable "cloudsql_connection_name" {
  type = string
}

variable "anthropic_secret_id" {
  type = string
}

variable "database_secret_id" {
  type = string
}

variable "labels" {
  type    = map(string)
  default = {}
}
