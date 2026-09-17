output "registry_url" {
  description = "URL base do OCIR para as imagens do SeniorLab."
  value       = module.registry.registry_url
}

output "registry_repository_backend" {
  description = "Nome do repositório OCIR da imagem do backend."
  value       = module.registry.repository_backend
}

output "registry_repository_frontend" {
  description = "Nome do repositório OCIR da imagem do frontend."
  value       = module.registry.repository_frontend
}

output "workload_identity_backend" {
  description = "Nome do Dynamic Group que representa a identidade do backend."
  value       = module.compute.dynamic_group_name
}

output "database_endpoint" {
  description = "Endpoint privado do OCI Database with PostgreSQL."
  value       = module.dados.db_private_endpoint
}

output "database_secret_name" {
  description = "Nome do secret com as credenciais do banco no OCI Vault."
  value       = module.segredos.database_secret_name
}

output "anthropic_secret_name" {
  description = "Nome do secret com a chave da API Anthropic no OCI Vault."
  value       = module.segredos.anthropic_secret_name
}

output "service_url_frontend" {
  description = "Hostname/IP público do Load Balancer que serve o frontend."
  value       = module.compute.load_balancer_hostname
}

output "vpc_id" {
  description = "OCID da VCN."
  value       = module.rede.vcn_id
}
