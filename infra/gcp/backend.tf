# Backend GCS dedicado (ADR-GCP-08), sem relação com o bucket de state da OCI.
# O bucket `seniorlab-gcp-tfstate` deve existir previamente.
terraform {
  backend "gcs" {
    bucket = "seniorlab-gcp-tfstate"
    prefix = "infra/gcp"
  }
}
