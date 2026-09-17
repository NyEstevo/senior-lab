terraform {
  required_version = "~> 1.9"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 5.0, < 7.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}
