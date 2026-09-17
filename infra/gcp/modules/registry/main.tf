# ADR-GCP-03: Artifact Registry, um repositório Docker por imagem.

resource "google_artifact_registry_repository" "backend" {
  project       = var.project_id
  location      = var.region
  repository_id = "${var.name_prefix}-backend"
  format        = "DOCKER"
  description   = "Imagem de produção do backend do SeniorLab"
  labels        = var.labels
}

resource "google_artifact_registry_repository" "frontend" {
  project       = var.project_id
  location      = var.region
  repository_id = "${var.name_prefix}-frontend"
  format        = "DOCKER"
  description   = "Imagem de produção do frontend do SeniorLab"
  labels        = var.labels
}
