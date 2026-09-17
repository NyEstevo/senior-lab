output "db_private_endpoint" {
  description = "IP privado do Container Instance rodando o Postgres temporário (ver nota em main.tf)."
  value       = oci_container_instances_container_instance.postgres.vnics[0].private_ip
}

output "db_system_id" {
  value = oci_container_instances_container_instance.postgres.id
}
