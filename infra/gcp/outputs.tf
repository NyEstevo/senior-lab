output "registry_url" {
  description = "URL do Artifact Registry para as imagens do SeniorLab."
  value       = module.registry.registry_url
}

output "registry_repository_backend" {
  description = "Nome do repositório Artifact Registry da imagem do backend."
  value       = module.registry.repository_backend
}

output "registry_repository_frontend" {
  description = "Nome do repositório Artifact Registry da imagem do frontend."
  value       = module.registry.repository_frontend
}

output "workload_identity_backend" {
  description = "E-mail da Service Account do Cloud Run do backend."
  value       = module.compute.backend_service_account_email
}

output "database_endpoint" {
  description = "Endpoint privado (IP) do Cloud SQL."
  value       = module.dados.db_private_ip
}

output "database_secret_name" {
  description = "Nome do secret com as credenciais do banco no Secret Manager."
  value       = module.segredos.database_secret_name
}

output "anthropic_secret_name" {
  description = "Nome do secret com a chave da API Anthropic no Secret Manager."
  value       = module.segredos.anthropic_secret_name
}

output "service_url_frontend" {
  description = "Domínio mapeado (se configurado) ou URL *.run.app do Cloud Run do frontend."
  value       = module.compute.frontend_url
}

output "vpc_id" {
  description = "ID da VPC."
  value       = module.rede.network_id
}
