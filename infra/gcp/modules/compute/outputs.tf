output "backend_service_account_email" {
  value = google_service_account.backend.email
}

output "frontend_url" {
  description = "IP público do Load Balancer se domain_name apontar para ele; caso contrário, use a URL *.run.app do próprio Cloud Run do frontend."
  value       = google_compute_global_address.lb.address
}
