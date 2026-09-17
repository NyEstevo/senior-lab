output "registry_url" {
  value = "${var.region_key}.ocir.io/${data.oci_objectstorage_namespace.this.namespace}"
}

output "repository_backend" {
  value = oci_artifacts_container_repository.backend.display_name
}

output "repository_frontend" {
  value = oci_artifacts_container_repository.frontend.display_name
}
