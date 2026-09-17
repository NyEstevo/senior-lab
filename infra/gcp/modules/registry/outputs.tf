output "registry_url" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}"
}

output "repository_backend" {
  value = google_artifact_registry_repository.backend.repository_id
}

output "repository_frontend" {
  value = google_artifact_registry_repository.frontend.repository_id
}
