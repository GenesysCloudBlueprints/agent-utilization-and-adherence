variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "genesys_client_id" {
  description = "Genesys Cloud Client ID"
  type        = string
}

variable "genesys_client_secret" {
  description = "Genesys Cloud Client Secret"
  type        = string
  sensitive   = true
}

variable "management_unit_id" {
  description = "Genesys Management Unit ID"
  type        = string
}

variable "pre_break_presence_id" {
  description = "Pre-break presence definition ID"
  type        = string
}