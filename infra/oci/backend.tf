# Backend nativo OCI para o state (ADR-OCI-08), disponível a partir do Terraform
# 1.12+. Substitui o backend "s3" (S3-compatible via AWS SDK v2) — esse método é
# deprecated pela própria Oracle e sofre de um bug conhecido de incompatibilidade
# (chunked encoding) que a OCI Object Storage não suporta.
# O bucket `bucket-20260916-2206` deve existir previamente (fora deste Terraform,
# para não haver dependência circular entre o state e o recurso que o hospeda).
# Autenticação via o mesmo perfil do ~/.oci/config usado pelo provider oci.
terraform {
  backend "oci" {
    bucket              = "bucket-20260916-2206"
    namespace           = "grkd2hxtfwoi"
    region              = "sa-saopaulo-1"
    key                 = "infra/oci/terraform.tfstate"
    auth                = "APIKey"
    config_file_profile = "DEFAULT"
  }
}
