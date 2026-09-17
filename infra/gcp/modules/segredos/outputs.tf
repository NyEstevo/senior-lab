output "anthropic_secret_id" {
  value = google_secret_manager_secret.anthropic_api_key.secret_id
}

output "database_secret_id" {
  value = google_secret_manager_secret.postgres_credentials.secret_id
}

output "anthropic_secret_name" {
  value = google_secret_manager_secret.anthropic_api_key.secret_id
}

output "database_secret_name" {
  value = google_secret_manager_secret.postgres_credentials.secret_id
}
