locals {
  name_prefix = "seniorlab-${var.environment}"

  common_labels = merge(
    {
      project     = "seniorlab"
      environment = var.environment
      managed-by  = "terraform"
    },
    var.labels
  )
}

# APIs necessárias antes do apply (ver Fase 5.1 do plano).
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "vpcaccess.googleapis.com",
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

module "rede" {
  source = "./modules/rede"

  project_id  = var.project_id
  region      = var.region
  name_prefix = local.name_prefix

  depends_on = [google_project_service.apis]
}

module "registry" {
  source = "./modules/registry"

  project_id  = var.project_id
  region      = var.region
  name_prefix = local.name_prefix
  labels      = local.common_labels

  depends_on = [google_project_service.apis]
}

module "dados" {
  source = "./modules/dados"

  project_id             = var.project_id
  region                 = var.region
  name_prefix            = local.name_prefix
  network_id             = module.rede.network_id
  private_vpc_connection = module.rede.private_vpc_connection
  postgres_db            = var.postgres_db
  postgres_user          = var.postgres_user
  postgres_password      = var.postgres_password
  db_version             = var.postgres_db_version
  labels                 = local.common_labels

  depends_on = [google_project_service.apis, module.rede]
}

module "segredos" {
  source = "./modules/segredos"

  project_id        = var.project_id
  name_prefix       = local.name_prefix
  anthropic_api_key = var.anthropic_api_key
  database_url      = "postgres://${var.postgres_user}:${var.postgres_password}@${module.dados.db_private_ip}:5432/${var.postgres_db}"
  labels            = local.common_labels

  depends_on = [google_project_service.apis]
}

module "compute" {
  source = "./modules/compute"

  project_id               = var.project_id
  region                   = var.region
  name_prefix              = local.name_prefix
  domain_name              = var.domain_name
  network_id               = module.rede.network_id
  vpc_connector_id         = module.rede.vpc_connector_id
  backend_image            = var.backend_image
  frontend_image           = var.frontend_image
  cloudsql_connection_name = module.dados.connection_name
  anthropic_secret_id      = module.segredos.anthropic_secret_id
  database_secret_id       = module.segredos.database_secret_id
  labels                   = local.common_labels

  depends_on = [google_project_service.apis, module.registry, module.segredos]
}
