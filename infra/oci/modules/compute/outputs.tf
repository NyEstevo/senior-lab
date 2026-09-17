output "dynamic_group_name" {
  value = oci_identity_dynamic_group.workload.name
}

output "load_balancer_hostname" {
  value = oci_load_balancer_load_balancer.this.ip_address_details[0].ip_address
}
