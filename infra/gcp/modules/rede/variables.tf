variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "name_prefix" {
  type = string
}

variable "subnet_cidr" {
  type    = string
  default = "10.30.0.0/24"
}

variable "connector_cidr" {
  description = "Range /28 dedicado ao Serverless VPC Access connector."
  type        = string
  default     = "10.30.1.0/28"
}
