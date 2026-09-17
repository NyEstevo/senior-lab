# ADR-OCI-01: Container Instances (serverless) para backend e frontend.
# ADR-OCI-06: Load Balancer público na frente do frontend, roteando /api/* ao backend.
# ADR-OCI-07: Dynamic Group + Policy de menor privilégio.

resource "oci_container_instances_container_instance" "backend" {
  compartment_id      = var.compartment_ocid
  display_name        = "${var.name_prefix}-backend"
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  shape               = var.container_shape
  freeform_tags       = var.freeform_tags

  shape_config {
    ocpus         = 1
    memory_in_gbs = 2
  }

  vnics {
    subnet_id             = var.private_subnet_id
    nsg_ids               = [var.backend_nsg_id]
    is_public_ip_assigned = false
  }

  containers {
    display_name = "backend"
    image_url    = var.backend_image

    # Só OCIDs e config não sensível aqui. ANTHROPIC_API_KEY e DATABASE_URL nunca são
    # passadas em texto plano (ADR-OCI-05): o backend lê os valores do OCI Vault no
    # boot (backend/src/secrets/vault.ts), autenticando pelo resource principal do
    # próprio Container Instance — autorizado pela policy do Dynamic Group abaixo.
    environment_variables = {
      PORT                  = "3000"
      ANTHROPIC_MODEL       = var.anthropic_model
      DATABASE_SECRET_OCID  = var.database_secret_id
      ANTHROPIC_SECRET_OCID = var.anthropic_secret_id
    }
  }

  container_restart_policy = "ALWAYS"
}

resource "oci_container_instances_container_instance" "frontend" {
  compartment_id      = var.compartment_ocid
  display_name        = "${var.name_prefix}-frontend"
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  shape               = var.container_shape
  freeform_tags       = var.freeform_tags

  shape_config {
    ocpus         = 1
    memory_in_gbs = 1
  }

  vnics {
    subnet_id             = var.private_subnet_id
    nsg_ids               = [var.frontend_nsg_id]
    is_public_ip_assigned = false
  }

  containers {
    display_name = "frontend"
    image_url    = var.frontend_image
  }

  container_restart_policy = "ALWAYS"
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_ocid
}

# --- IAM: Dynamic Group + Policy de menor privilégio ---

resource "oci_identity_dynamic_group" "workload" {
  compartment_id = var.tenancy_ocid
  name           = "${var.name_prefix}-workload-dg"
  description    = "Container Instances do backend/frontend do SeniorLab"

  matching_rule = "ALL {resource.type = 'computecontainerinstance', resource.compartment.id = '${var.compartment_ocid}'}"
}

resource "oci_identity_policy" "workload" {
  compartment_id = var.compartment_ocid
  name           = "${var.name_prefix}-workload-policy"
  description    = "Menor privilégio: ler secrets do Vault e fazer pull das imagens no OCIR"

  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.workload.name} to read secret-bundles in compartment id ${var.compartment_ocid} where target.vault.id = '${var.vault_id}'",
    "Allow dynamic-group ${oci_identity_dynamic_group.workload.name} to read repos in compartment id ${var.compartment_ocid}",
  ]
}

# --- Load Balancer público ---

resource "oci_load_balancer_load_balancer" "this" {
  compartment_id             = var.compartment_ocid
  display_name               = "${var.name_prefix}-lb"
  shape                      = "flexible"
  subnet_ids                 = [var.public_subnet_id]
  is_private                 = false
  network_security_group_ids = [var.lb_nsg_id]
  freeform_tags              = var.freeform_tags

  shape_details {
    minimum_bandwidth_in_mbps = 10
    maximum_bandwidth_in_mbps = 100
  }
}

resource "oci_load_balancer_backend_set" "frontend" {
  name             = "${var.name_prefix}-bs-frontend"
  load_balancer_id = oci_load_balancer_load_balancer.this.id
  policy           = "ROUND_ROBIN"

  health_checker {
    protocol = "HTTP"
    url_path = "/"
    port     = 80
  }
}

resource "oci_load_balancer_backend_set" "backend" {
  name             = "${var.name_prefix}-bs-backend"
  load_balancer_id = oci_load_balancer_load_balancer.this.id
  policy           = "ROUND_ROBIN"

  health_checker {
    protocol = "HTTP"
    url_path = "/health"
    port     = 3000
  }
}

resource "oci_load_balancer_backend" "frontend" {
  load_balancer_id = oci_load_balancer_load_balancer.this.id
  backendset_name  = oci_load_balancer_backend_set.frontend.name
  ip_address       = oci_container_instances_container_instance.frontend.vnics[0].private_ip
  port             = 80
}

resource "oci_load_balancer_backend" "backend" {
  load_balancer_id = oci_load_balancer_load_balancer.this.id
  backendset_name  = oci_load_balancer_backend_set.backend.name
  ip_address       = oci_container_instances_container_instance.backend.vnics[0].private_ip
  port             = 3000
}

# Certificado autoassinado, gerado pelo próprio Terraform, como placeholder até
# existir um domínio real. O serviço OCI Certificates Management só emite certificados
# a partir de uma CA interna própria (fora do escopo deste MVP) — não faz emissão
# pública tipo ACME/Let's Encrypt. Quando houver domínio real, troque este bloco por um
# certificado real (ex.: importado do Let's Encrypt) sem mudar o resto da arquitetura
# (ver LACUNA de domínio, Fase 1.9 do plano).
resource "tls_private_key" "frontend" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "frontend" {
  private_key_pem = tls_private_key.frontend.private_key_pem

  subject {
    common_name = var.domain_name
  }

  dns_names = [var.domain_name]

  validity_period_hours = 8760 # 1 ano

  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]
}

resource "oci_load_balancer_certificate" "frontend" {
  load_balancer_id   = oci_load_balancer_load_balancer.this.id
  certificate_name   = "${var.name_prefix}-cert"
  private_key        = tls_private_key.frontend.private_key_pem
  public_certificate = tls_self_signed_cert.frontend.cert_pem
}

resource "oci_load_balancer_path_route_set" "api" {
  name             = "${var.name_prefix}-paths"
  load_balancer_id = oci_load_balancer_load_balancer.this.id

  path_routes {
    backend_set_name = oci_load_balancer_backend_set.backend.name
    path             = "/api"
    path_match_type {
      match_type = "PREFIX_MATCH"
    }
  }
}

resource "oci_load_balancer_listener" "https" {
  load_balancer_id         = oci_load_balancer_load_balancer.this.id
  name                     = "${var.name_prefix}-https"
  default_backend_set_name = oci_load_balancer_backend_set.frontend.name
  path_route_set_name      = oci_load_balancer_path_route_set.api.name
  port                     = 443
  protocol                 = "HTTP"

  ssl_configuration {
    certificate_name        = oci_load_balancer_certificate.frontend.certificate_name
    verify_peer_certificate = false
  }
}

resource "oci_load_balancer_listener" "http" {
  load_balancer_id         = oci_load_balancer_load_balancer.this.id
  name                     = "${var.name_prefix}-http"
  default_backend_set_name = oci_load_balancer_backend_set.frontend.name
  path_route_set_name      = oci_load_balancer_path_route_set.api.name
  port                     = 80
  protocol                 = "HTTP"
}
