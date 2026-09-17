# ADR-GCP-05: Secret Manager, 2 secrets (anthropic-api-key, postgres-credentials).
# O IAM binding de leitura (roles/secretmanager.secretAccessor) é feito no módulo
# compute, que é quem cria a Service Account do backend (evita dependência circular).

resource "google_secret_manager_secret" "anthropic_api_key" {
  project   = var.project_id
  secret_id = "${var.name_prefix}-anthropic-api-key"
  labels    = var.labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "anthropic_api_key" {
  secret      = google_secret_manager_secret.anthropic_api_key.id
  secret_data = var.anthropic_api_key
}

resource "google_secret_manager_secret" "postgres_credentials" {
  project   = var.project_id
  secret_id = "${var.name_prefix}-postgres-credentials"
  labels    = var.labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "postgres_credentials" {
  secret      = google_secret_manager_secret.postgres_credentials.id
  secret_data = var.database_url
}
