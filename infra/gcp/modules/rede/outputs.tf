output "network_id" {
  value = google_compute_network.this.id
}

output "network_name" {
  value = google_compute_network.this.name
}

output "subnet_id" {
  value = google_compute_subnetwork.this.id
}

output "vpc_connector_id" {
  value = google_vpc_access_connector.this.id
}

output "private_vpc_connection" {
  description = "Referência à conexão de peering privado, usada pelo módulo dados para depender dela antes de criar o Cloud SQL."
  value       = google_service_networking_connection.private_services.id
}
