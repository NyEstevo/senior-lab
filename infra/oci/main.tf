locals {
  name_prefix = "seniorlab-${var.environment}"

  common_tags = merge(
    {
      project     = "seniorlab"
      environment = var.environment
      managed-by  = "terraform"
    },
    var.freeform_tags
  )
}

module "rede" {
  source = "./modules/rede"

  compartment_ocid = var.compartment_ocid
  name_prefix      = local.name_prefix
  freeform_tags    = local.common_tags
}

module "registry" {
  source = "./modules/registry"

  compartment_ocid = var.compartment_ocid
  name_prefix      = local.name_prefix
  freeform_tags    = local.common_tags
}

module "dados" {
  source = "./modules/dados"

  compartment_ocid  = var.compartment_ocid
  name_prefix       = local.name_prefix
  subnet_id         = module.rede.private_subnet_id
  nsg_id            = module.rede.db_nsg_id
  postgres_db       = var.postgres_db
  postgres_user     = var.postgres_user
  postgres_password = var.postgres_password
  db_version        = var.postgres_db_version
  freeform_tags     = local.common_tags
}

module "segredos" {
  source = "./modules/segredos"

  compartment_ocid  = var.compartment_ocid
  name_prefix       = local.name_prefix
  anthropic_api_key = var.anthropic_api_key
  database_url      = "postgres://${var.postgres_user}:${var.postgres_password}@${module.dados.db_private_endpoint}:5432/${var.postgres_db}"
  freeform_tags     = local.common_tags
}

module "compute" {
  source = "./modules/compute"

  compartment_ocid    = var.compartment_ocid
  tenancy_ocid        = var.tenancy_ocid
  name_prefix         = local.name_prefix
  domain_name         = var.domain_name
  public_subnet_id    = module.rede.public_subnet_id
  private_subnet_id   = module.rede.private_subnet_id
  backend_nsg_id      = module.rede.backend_nsg_id
  frontend_nsg_id     = module.rede.frontend_nsg_id
  lb_nsg_id           = module.rede.lb_nsg_id
  backend_image       = var.backend_image
  frontend_image      = var.frontend_image
  anthropic_model     = var.anthropic_model
  vault_id            = module.segredos.vault_id
  anthropic_secret_id = module.segredos.anthropic_secret_id
  database_secret_id  = module.segredos.database_secret_id
  freeform_tags       = local.common_tags
}
