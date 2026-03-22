variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "SSH public key for server access"
  type        = string
}

variable "ssh_private_key_path" {
  description = "Path to SSH private key (for provisioning)"
  type        = string
  default     = "~/.ssh/id_ed25519"
}
