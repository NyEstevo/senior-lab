# DESVIO TEMPORÁRIO do ADR-OCI-04 (OCI Database with PostgreSQL, gerenciado).
#
# Motivo: a conta OCI usada é Trial/Free Tier e o serviço "OCI Database with
# PostgreSQL" veio com o limite `dbsystem-count` em 0 nessa tenancy — a API recusa a
# criação com "400 LimitExceeded" até pedir aumento de limite ou fazer upgrade para
# Pay As You Go (ver PASSOAPASSO.md).
#
# Enquanto isso não é resolvido, o Postgres roda dentro de um Container Instance, com
# volume EMPTYDIR (o único tipo de volume que Container Instances da OCI suportam —
# não existe volume de rede persistente nesse serviço). Isso significa:
#   - SEM backup automático, SEM patching gerenciado, SEM alta disponibilidade.
#   - Os dados são perdidos se o container reiniciar ou for recriado.
# É só para destravar teste/demo agora. Assim que o limite do dbsystem for liberado,
# troque este módulo de volta pelo `oci_psql_db_system` (ver histórico em
# PASSOAPASSO.md) sem precisar mudar a interface (inputs/outputs) usada pelo main.tf
# raiz nem pelo módulo compute.

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_ocid
}

resource "oci_container_instances_container_instance" "postgres" {
  compartment_id      = var.compartment_ocid
  display_name        = "${var.name_prefix}-postgres-temp"
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  shape               = var.container_shape
  freeform_tags       = var.freeform_tags

  shape_config {
    ocpus         = 1
    memory_in_gbs = 2
  }

  vnics {
    subnet_id             = var.subnet_id
    nsg_ids               = [var.nsg_id]
    is_public_ip_assigned = false
  }

  containers {
    display_name = "postgres"
    image_url    = "docker.io/library/postgres:${var.db_version}-alpine"

    environment_variables = {
      POSTGRES_USER     = var.postgres_user
      POSTGRES_PASSWORD = var.postgres_password
      POSTGRES_DB       = var.postgres_db
      PGDATA            = "/var/lib/postgresql/data/pgdata"
    }

    volume_mounts {
      volume_name = "pgdata"
      mount_path  = "/var/lib/postgresql/data"
    }
  }

  volumes {
    name          = "pgdata"
    volume_type   = "EMPTYDIR"
    backing_store = "EPHEMERAL_STORAGE"
  }

  container_restart_policy = "ALWAYS"
}
