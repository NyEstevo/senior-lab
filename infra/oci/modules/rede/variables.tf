variable "compartment_ocid" {
  type = string
}

variable "name_prefix" {
  type = string
}

variable "vcn_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "public_subnet_cidr" {
  type    = string
  default = "10.20.0.0/24"
}

variable "private_subnet_cidr" {
  type    = string
  default = "10.20.1.0/24"
}

variable "freeform_tags" {
  type    = map(string)
  default = {}
}
