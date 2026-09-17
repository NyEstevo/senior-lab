variable "compartment_ocid" {
  type = string
}

variable "name_prefix" {
  type = string
}

variable "region_key" {
  description = "Chave curta da região usada no hostname do OCIR (ex.: gru para sa-saopaulo-1)."
  type        = string
  default     = "gru"
}

variable "freeform_tags" {
  type    = map(string)
  default = {}
}
