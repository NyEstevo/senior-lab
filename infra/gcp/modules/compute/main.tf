# ADR-GCP-01: Cloud Run (serverless) para backend e frontend.
# ADR-GCP-06: frontend público; backend privado, exposto só através do mesmo Load
# Balancer/domínio (Serverless NEG), mantendo um único ponto de entrada.
# ADR-GCP-07: Service Account dedicada por serviço, IAM binding mínimo.

resource "google_service_account" "backend" {
  project      = var.project_id
  account_id   = "${var.name_prefix}-backend"
  display_name = "SeniorLab backend (Cloud Run)"
}

resource "google_service_account" "frontend" {
  project      = var.project_id
  account_id   = "${var.name_prefix}-frontend"
  display_name = "SeniorLab frontend (Cloud Run)"
}

resource "google_secret_manager_secret_iam_member" "backend_anthropic" {
  project   = var.project_id
  secret_id = var.anthropic_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_database" {
  project   = var.project_id
  secret_id = var.database_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_project_iam_member" "backend_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# --- Cloud Run ---

resource "google_cloud_run_v2_service" "backend" {
  project  = var.project_id
  name     = "${var.name_prefix}-backend"
  location = var.region

  # Privado: só alcançável internamente ou através do Load Balancer externo abaixo.
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.backend.email

    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.backend_image

      ports {
        container_port = 3000
      }

      env {
        name  = "PORT"
        value = "3000"
      }

      env {
        name = "ANTHROPIC_API_KEY"
        value_source {
          secret_key_ref {
            secret  = var.anthropic_secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = var.database_secret_id
            version = "latest"
          }
        }
      }
    }

    annotations = {
      "run.googleapis.com/cloudsql-instances" = var.cloudsql_connection_name
    }
  }

  labels = var.labels
}

resource "google_cloud_run_v2_service" "frontend" {
  project  = var.project_id
  name     = "${var.name_prefix}-frontend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.frontend.email

    containers {
      image = var.frontend_image

      ports {
        container_port = 80
      }
    }
  }

  labels = var.labels
}

# O ingress acima já restringe o alcance de rede; o invoker público é liberado para
# que o Load Balancer (e, no caso do frontend, o próprio domínio) consiga invocar.
resource "google_cloud_run_v2_service_iam_member" "backend_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "frontend_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- Load Balancer externo unificando frontend e backend sob o mesmo domínio ---

resource "google_compute_region_network_endpoint_group" "backend" {
  project               = var.project_id
  name                  = "${var.name_prefix}-neg-backend"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.backend.name
  }
}

resource "google_compute_region_network_endpoint_group" "frontend" {
  project               = var.project_id
  name                  = "${var.name_prefix}-neg-frontend"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.frontend.name
  }
}

resource "google_compute_backend_service" "backend" {
  project = var.project_id
  name    = "${var.name_prefix}-bs-backend"

  backend {
    group = google_compute_region_network_endpoint_group.backend.id
  }
}

resource "google_compute_backend_service" "frontend" {
  project = var.project_id
  name    = "${var.name_prefix}-bs-frontend"

  backend {
    group = google_compute_region_network_endpoint_group.frontend.id
  }
}

resource "google_compute_url_map" "this" {
  project         = var.project_id
  name            = "${var.name_prefix}-urlmap"
  default_service = google_compute_backend_service.frontend.id

  host_rule {
    hosts        = [var.domain_name]
    path_matcher = "api-split"
  }

  path_matcher {
    name            = "api-split"
    default_service = google_compute_backend_service.frontend.id

    path_rule {
      paths   = ["/api", "/api/*"]
      service = google_compute_backend_service.backend.id
    }
  }
}

# Certificado gerenciado pelo Google associado ao domain_name; fica pendente de
# validação até o DNS apontar para o IP do Load Balancer (ver LACUNA de domínio,
# Fase 1.9 do plano).
resource "google_compute_managed_ssl_certificate" "this" {
  project = var.project_id
  name    = "${var.name_prefix}-cert"

  managed {
    domains = [var.domain_name]
  }
}

resource "google_compute_global_address" "lb" {
  project = var.project_id
  name    = "${var.name_prefix}-lb-ip"
}

resource "google_compute_target_https_proxy" "this" {
  project          = var.project_id
  name             = "${var.name_prefix}-https-proxy"
  url_map          = google_compute_url_map.this.id
  ssl_certificates = [google_compute_managed_ssl_certificate.this.id]
}

resource "google_compute_global_forwarding_rule" "https" {
  project               = var.project_id
  name                  = "${var.name_prefix}-fr-https"
  target                = google_compute_target_https_proxy.this.id
  port_range            = "443"
  ip_address            = google_compute_global_address.lb.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
