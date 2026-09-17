output "vcn_id" {
  value = oci_core_vcn.this.id
}

output "public_subnet_id" {
  value = oci_core_subnet.public.id
}

output "private_subnet_id" {
  value = oci_core_subnet.private.id
}

output "lb_nsg_id" {
  value = oci_core_network_security_group.lb.id
}

output "frontend_nsg_id" {
  value = oci_core_network_security_group.frontend.id
}

output "backend_nsg_id" {
  value = oci_core_network_security_group.backend.id
}

output "db_nsg_id" {
  value = oci_core_network_security_group.db.id
}
