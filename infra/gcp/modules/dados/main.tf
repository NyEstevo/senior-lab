# ADR-GCP-04: Cloud SQL for PostgreSQL 16, instância com IP privado (via VPC peering
# gerenciado pelo próprio Cloud SQL, ver módulo rede).

resource "google_sql_database_instance" "this" {
  project             = var.project_id
  name                = "${var.name_prefix}-postgres"
  region              = var.region
  database_version    = var.db_version
  deletion_protection = false

  settings {
    tier = var.tier

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.network_id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = var.backup_retention_days
    }

    user_labels = var.labels
  }
}

resource "google_sql_database" "seniorlab" {
  project  = var.project_id
  name     = var.postgres_db
  instance = google_sql_database_instance.this.name
}

resource "google_sql_user" "seniorlab" {
  project  = var.project_id
  name     = var.postgres_user
  instance = google_sql_database_instance.this.name
  password = var.postgres_password
}
