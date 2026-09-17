output "db_private_ip" {
  description = "IP privado de conexão do Cloud SQL."
  value       = google_sql_database_instance.this.private_ip_address
}

output "connection_name" {
  description = "Connection name do Cloud SQL, usado pelo Cloud Run Cloud SQL connector."
  value       = google_sql_database_instance.this.connection_name
}
