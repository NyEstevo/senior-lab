output "vault_id" {
  value = oci_kms_vault.this.id
}

output "anthropic_secret_id" {
  value = oci_vault_secret.anthropic_api_key.id
}

output "database_secret_id" {
  value = oci_vault_secret.postgres_credentials.id
}

output "anthropic_secret_name" {
  value = oci_vault_secret.anthropic_api_key.secret_name
}

output "database_secret_name" {
  value = oci_vault_secret.postgres_credentials.secret_name
}
