# ADR-OCI-05: OCI Vault com 2 secrets (anthropic-api-key, postgres-credentials).
# A policy de leitura restrita ao Dynamic Group é criada no módulo compute, que é
# quem define o Dynamic Group (evita dependência circular entre os módulos).

resource "oci_kms_vault" "this" {
  compartment_id = var.compartment_ocid
  display_name   = "${var.name_prefix}-vault"
  vault_type     = "DEFAULT"
  freeform_tags  = var.freeform_tags
}

resource "oci_kms_key" "this" {
  compartment_id      = var.compartment_ocid
  display_name        = "${var.name_prefix}-secrets-key"
  management_endpoint = oci_kms_vault.this.management_endpoint
  freeform_tags       = var.freeform_tags

  key_shape {
    algorithm = "AES"
    length    = 32
  }
}

resource "oci_vault_secret" "anthropic_api_key" {
  compartment_id = var.compartment_ocid
  vault_id       = oci_kms_vault.this.id
  key_id         = oci_kms_key.this.id
  secret_name    = "${var.name_prefix}-anthropic-api-key"
  freeform_tags  = var.freeform_tags

  secret_content {
    content_type = "BASE64"
    content      = base64encode(var.anthropic_api_key)
  }
}

resource "oci_vault_secret" "postgres_credentials" {
  compartment_id = var.compartment_ocid
  vault_id       = oci_kms_vault.this.id
  key_id         = oci_kms_key.this.id
  secret_name    = "${var.name_prefix}-postgres-credentials"
  freeform_tags  = var.freeform_tags

  secret_content {
    content_type = "BASE64"
    content      = base64encode(var.database_url)
  }
}
