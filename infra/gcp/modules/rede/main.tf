# ADR-GCP-02: 1 VPC + subnet; Serverless VPC Access connector para o Cloud Run do
# backend alcançar o Cloud SQL por IP privado; Cloud NAT para egress explícito até
# api.anthropic.com.

resource "google_compute_network" "this" {
  project                 = var.project_id
  name                    = "${var.name_prefix}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "this" {
  project       = var.project_id
  name          = "${var.name_prefix}-subnet"
  region        = var.region
  network       = google_compute_network.this.id
  ip_cidr_range = var.subnet_cidr

  private_ip_google_access = true
}

resource "google_vpc_access_connector" "this" {
  project       = var.project_id
  name          = "${var.name_prefix}-connector"
  region        = var.region
  network       = google_compute_network.this.name
  ip_cidr_range = var.connector_cidr

  min_instances = 2
  max_instances = 3
}

resource "google_compute_router" "this" {
  project = var.project_id
  name    = "${var.name_prefix}-router"
  region  = var.region
  network = google_compute_network.this.id
}

resource "google_compute_router_nat" "this" {
  project                            = var.project_id
  name                               = "${var.name_prefix}-nat"
  region                             = var.region
  router                             = google_compute_router.this.name
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

# Peering privado para o Cloud SQL (IP privado, sem exposição pública — ADR-GCP-02).
resource "google_compute_global_address" "private_services" {
  project       = var.project_id
  name          = "${var.name_prefix}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.this.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.this.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

# Firewall: só permite egress (default allow) e ingress interno necessário ao
# connector; nada expõe recurso algum a 0.0.0.0/0 diretamente (a exposição pública é
# só via Cloud Run/Load Balancer, fora da VPC).
resource "google_compute_firewall" "allow_internal" {
  project = var.project_id
  name    = "${var.name_prefix}-allow-internal"
  network = google_compute_network.this.id

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  source_ranges = [var.subnet_cidr, var.connector_cidr]
}
