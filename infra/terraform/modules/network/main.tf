terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.38"
    }
  }
}

# The network.
#
# Two decisions here are worth more than the rest of the file put together.
#
# **There is no NAT Gateway.** One costs $32/month per environment before a single byte
# moves, which is most of the compute bill for this product. Application tasks therefore
# run in public subnets with public addresses and reach ECR, SES, and S3 directly. That
# word "public" describes the *route table*, not the exposure: the tasks' security group
# accepts nothing from the internet, only from inside the VPC, so the only way in is
# through the load balancer. The alternative — private subnets plus interface endpoints
# for ECR, ECR-dkr, CloudWatch Logs, SSM, and Secrets Manager — is five endpoints at
# roughly $8/month each, which is *more* than the NAT it was meant to avoid.
#
# **The database is not in those subnets.** It sits in a second pair with no route to the
# internet gateway at all, so a misconfigured security group still cannot expose it.

variable "env" {
  description = "Environment name. Suffixes every resource name."
  type        = string
}

variable "prefix" {
  description = "Name prefix shared by every resource in this environment."
  type        = string
}

variable "cidr_block" {
  description = "VPC CIDR. Distinct per environment so the two could be peered later without renumbering."
  type        = string
}

variable "availability_zones" {
  description = <<-EOT
    Exactly two. Two is a floor, not a choice: an Application Load Balancer requires
    subnets in at least two zones, and so does an RDS subnet group — even a Single-AZ
    instance, which is what this deployment runs.
  EOT
  type        = list(string)

  validation {
    condition     = length(var.availability_zones) == 2
    error_message = "Give exactly two availability zones."
  }
}

variable "app_port" {
  description = "Port the web container listens on. The load balancer reaches it here."
  type        = number
}

variable "api_port" {
  description = "Port the API container listens on. Only the web tasks reach it."
  type        = number
}

locals {
  # /20 subnets: 4094 addresses each, far more than this needs, but renumbering is a
  # rebuild and cheap headroom is the whole point of choosing now.
  public_cidrs  = [cidrsubnet(var.cidr_block, 4, 0), cidrsubnet(var.cidr_block, 4, 1)]
  private_cidrs = [cidrsubnet(var.cidr_block, 4, 8), cidrsubnet(var.cidr_block, 4, 9)]
}

data "aws_region" "current" {}

resource "aws_vpc" "main" {
  cidr_block         = var.cidr_block
  enable_dns_support = true
  # Cloud Map's private DNS namespace — how the web tasks find the API — resolves through
  # the VPC resolver and silently returns nothing without this.
  enable_dns_hostnames = true

  tags = { Name = "${var.prefix}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.prefix}-igw" }
}

# ---------------------------------------------------------------------------------------
# Public subnets — the load balancer and the application tasks
# ---------------------------------------------------------------------------------------

resource "aws_subnet" "public" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = local.public_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]
  # A task in a public subnet without a public address has no egress at all — it cannot
  # even pull its own image. This is what replaces the NAT Gateway.
  map_public_ip_on_launch = true

  tags = { Name = "${var.prefix}-public-${var.availability_zones[count.index]}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.prefix}-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count = 2

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ---------------------------------------------------------------------------------------
# Private subnets — the database, and nothing else
# ---------------------------------------------------------------------------------------

resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = { Name = "${var.prefix}-private-${var.availability_zones[count.index]}" }
}

# No default route. The absence is the security control: nothing in these subnets can
# reach the internet, and the internet cannot reach back, regardless of any security
# group anyone writes later.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.prefix}-private" }
}

resource "aws_route_table_association" "private" {
  count = 2

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# S3 through a gateway endpoint rather than over the internet gateway: it is free, it
# keeps signed contracts off the public internet entirely, and it removes the egress
# charge on every PDF the API writes.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id, aws_route_table.private.id]

  tags = { Name = "${var.prefix}-s3" }
}

# ---------------------------------------------------------------------------------------
# Security groups
# ---------------------------------------------------------------------------------------

# The web tasks. Reached only by the load balancer.
#
# The ingress rule names the VPC CIDR rather than the load balancer's own security group,
# and that is not laziness: ECS Express Mode creates and owns the load balancer, so its
# security group id does not exist in this state and cannot be referenced. Everything in
# this VPC is either that load balancer or a task we placed here, so the CIDR is a true
# statement of "from inside, never from outside".
resource "aws_security_group" "web" {
  name        = "${var.prefix}-web"
  description = "Web tasks: load balancer in, anywhere out"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.prefix}-web" }
}

resource "aws_vpc_security_group_ingress_rule" "web_from_vpc" {
  security_group_id = aws_security_group.web.id
  description       = "Load balancer health checks and traffic"
  cidr_ipv4         = aws_vpc.main.cidr_block
  from_port         = var.app_port
  to_port           = var.app_port
  ip_protocol       = "tcp"
}

# Egress is open because the task legitimately talks to ECR, CloudWatch Logs, SES, S3,
# and the API. Narrowing it to prefix lists would be worth doing if the task ever ran
# third-party code; today it runs only ours.
resource "aws_vpc_security_group_egress_rule" "web_all" {
  security_group_id = aws_security_group.web.id
  description       = "ECR, CloudWatch Logs, SES, S3, and the API"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# The API tasks. Reached only by the web tasks — never by a load balancer, and never from
# the internet. The API has no public address of any kind: the browser talks to the web
# app, which proxies /api/* here through the Next.js rewrite that already exists for
# local development. That is also what keeps the session cookie same-origin.
resource "aws_security_group" "api" {
  name        = "${var.prefix}-api"
  description = "API tasks: web tasks in, anywhere out"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.prefix}-api" }
}

resource "aws_vpc_security_group_ingress_rule" "api_from_web" {
  security_group_id = aws_security_group.api.id
  # EC2 restricts rule descriptions to a-zA-Z0-9 and ._-:/()#,@[]+=&;{}!$* — an apostrophe
  # is rejected outright, with an error that names the character set but not the offender.
  description                  = "Only the web tasks, through the Next.js rewrite proxy"
  referenced_security_group_id = aws_security_group.web.id
  from_port                    = var.api_port
  to_port                      = var.api_port
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "api_all" {
  security_group_id = aws_security_group.api.id
  description       = "ECR, CloudWatch Logs, SES, S3, and the database"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# The database. Reached by the API tasks, and by the one-off migration task — which runs
# with the API's own security group precisely so this rule does not have to grow.
resource "aws_security_group" "database" {
  name        = "${var.prefix}-database"
  description = "Postgres: API tasks only"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.prefix}-database" }
}

resource "aws_vpc_security_group_ingress_rule" "database_from_api" {
  security_group_id            = aws_security_group.database.id
  description                  = "Postgres from the API tasks"
  referenced_security_group_id = aws_security_group.api.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

output "vpc_id" {
  description = "The VPC every resource in this environment lives in."
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR of the VPC."
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "Subnets the load balancer and the application tasks run in."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Subnets with no route to the internet. The database, and nothing else."
  value       = aws_subnet.private[*].id
}

output "web_security_group_id" {
  description = "Security group of the web tasks."
  value       = aws_security_group.web.id
}

output "api_security_group_id" {
  description = "Security group of the API tasks and the migration task."
  value       = aws_security_group.api.id
}

output "database_security_group_id" {
  description = "Security group of the database."
  value       = aws_security_group.database.id
}
