# ADR-OCI-03: OCIR, um repositório por imagem.

resource "oci_artifacts_container_repository" "backend" {
  compartment_id = var.compartment_ocid
  display_name   = "${var.name_prefix}-backend"
  is_public      = false
  freeform_tags  = var.freeform_tags
}

resource "oci_artifacts_container_repository" "frontend" {
  compartment_id = var.compartment_ocid
  display_name   = "${var.name_prefix}-frontend"
  is_public      = false
  freeform_tags  = var.freeform_tags
}

data "oci_objectstorage_namespace" "this" {}
