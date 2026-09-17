# ADR-OCI-02: 1 VCN, subnet pública (só LB) e subnet privada (Container Instances +
# banco); Internet Gateway na pública, NAT Gateway na privada.

resource "oci_core_vcn" "this" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = [var.vcn_cidr]
  display_name   = "${var.name_prefix}-vcn"
  dns_label      = replace(var.name_prefix, "-", "")
  freeform_tags  = var.freeform_tags
}

resource "oci_core_internet_gateway" "this" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name_prefix}-igw"
  enabled        = true
  freeform_tags  = var.freeform_tags
}

resource "oci_core_nat_gateway" "this" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name_prefix}-nat"
  freeform_tags  = var.freeform_tags
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name_prefix}-rt-public"
  freeform_tags  = var.freeform_tags

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.this.id
  }
}

resource "oci_core_route_table" "private" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name_prefix}-rt-private"
  freeform_tags  = var.freeform_tags

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_nat_gateway.this.id
  }
}

resource "oci_core_subnet" "public" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.this.id
  cidr_block                 = var.public_subnet_cidr
  display_name               = "${var.name_prefix}-subnet-public"
  route_table_id             = oci_core_route_table.public.id
  prohibit_public_ip_on_vnic = false
  dns_label                  = "public"
  freeform_tags              = var.freeform_tags
}

resource "oci_core_subnet" "private" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.this.id
  cidr_block                 = var.private_subnet_cidr
  display_name               = "${var.name_prefix}-subnet-private"
  route_table_id             = oci_core_route_table.private.id
  prohibit_public_ip_on_vnic = true
  dns_label                  = "private"
  freeform_tags              = var.freeform_tags
}

# --- Network Security Groups ---

resource "oci_core_network_security_group" "lb" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name_prefix}-nsg-lb"
  freeform_tags  = var.freeform_tags
}

resource "oci_core_network_security_group" "frontend" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name_prefix}-nsg-frontend"
  freeform_tags  = var.freeform_tags
}

resource "oci_core_network_security_group" "backend" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name_prefix}-nsg-backend"
  freeform_tags  = var.freeform_tags
}

resource "oci_core_network_security_group" "db" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name_prefix}-nsg-db"
  freeform_tags  = var.freeform_tags
}

# LB: ingress público 80/443, egress liberado para as NSGs internas.
resource "oci_core_network_security_group_security_rule" "lb_ingress_http" {
  network_security_group_id = oci_core_network_security_group.lb.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = 80
      max = 80
    }
  }
}

resource "oci_core_network_security_group_security_rule" "lb_ingress_https" {
  network_security_group_id = oci_core_network_security_group.lb.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_network_security_group_security_rule" "lb_egress_all" {
  network_security_group_id = oci_core_network_security_group.lb.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
}

# Frontend: ingress só do LB, na porta 80 (nginx de produção).
resource "oci_core_network_security_group_security_rule" "frontend_ingress_from_lb" {
  network_security_group_id = oci_core_network_security_group.frontend.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = oci_core_network_security_group.lb.id
  source_type               = "NETWORK_SECURITY_GROUP"
  tcp_options {
    destination_port_range {
      min = 80
      max = 80
    }
  }
}

resource "oci_core_network_security_group_security_rule" "frontend_egress_all" {
  network_security_group_id = oci_core_network_security_group.frontend.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
}

# Backend: ingress só do LB, na porta 3000 (rota /api/* do LB).
resource "oci_core_network_security_group_security_rule" "backend_ingress_from_lb" {
  network_security_group_id = oci_core_network_security_group.backend.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = oci_core_network_security_group.lb.id
  source_type               = "NETWORK_SECURITY_GROUP"
  tcp_options {
    destination_port_range {
      min = 3000
      max = 3000
    }
  }
}

# Backend: egress HTTPS liberado (api.anthropic.com) via NAT Gateway.
resource "oci_core_network_security_group_security_rule" "backend_egress_https" {
  network_security_group_id = oci_core_network_security_group.backend.id
  direction                 = "EGRESS"
  protocol                  = "6"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = 443
      max = 443
    }
  }
}

# Backend: egress para o banco na subnet privada.
resource "oci_core_network_security_group_security_rule" "backend_egress_db" {
  network_security_group_id = oci_core_network_security_group.backend.id
  direction                 = "EGRESS"
  protocol                  = "6"
  destination               = oci_core_network_security_group.db.id
  destination_type          = "NETWORK_SECURITY_GROUP"
  tcp_options {
    destination_port_range {
      min = 5432
      max = 5432
    }
  }
}

# DB: ingress só do backend, porta 5432. Nunca exposto publicamente.
resource "oci_core_network_security_group_security_rule" "db_ingress_from_backend" {
  network_security_group_id = oci_core_network_security_group.db.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = oci_core_network_security_group.backend.id
  source_type               = "NETWORK_SECURITY_GROUP"
  tcp_options {
    destination_port_range {
      min = 5432
      max = 5432
    }
  }
}

# DB: egress HTTPS temporário, só necessário enquanto o Postgres roda em Container
# Instance e precisa puxar a imagem pública do Docker Hub (ver desvio do ADR-OCI-04 em
# modules/dados/main.tf). Remover quando voltar a ser OCI Database with PostgreSQL
# gerenciado (que não roda imagem nenhuma).
resource "oci_core_network_security_group_security_rule" "db_egress_https_temp" {
  network_security_group_id = oci_core_network_security_group.db.id
  direction                 = "EGRESS"
  protocol                  = "6"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = 443
      max = 443
    }
  }
}
