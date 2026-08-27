output "app_url" {
  description = "The address people open. AWS-issued, HTTPS, and the only public entry point."
  value       = local.app_public_url
}

output "cluster_name" {
  description = "ECS cluster holding both services and the migration task."
  value       = aws_ecs_cluster.main.name
}

output "web_service_name" {
  description = "Name of the Express Mode web service."
  value       = aws_ecs_express_gateway_service.web.service_name
}

output "api_service_name" {
  description = "Name of the API service."
  value       = aws_ecs_service.api.name
}

output "api_internal_origin" {
  description = "Where the web app proxies /api/* to. Resolvable only inside the VPC."
  value       = local.api_internal_origin
}

output "web_image" {
  description = <<-EOT
    Image digest the web service is running. `make deploy-*` reads this to redeploy one
    service without disturbing the other.
  EOT
  value       = var.web_image
}

output "api_image" {
  description = "Image digest the API service and the migration task are running."
  value       = var.api_image
}

output "migrate_task_definition" {
  description = "Task definition `make migrate-<env>` runs."
  value       = aws_ecs_task_definition.migrate.arn
}

output "task_subnet_ids" {
  description = "Subnets a one-off task must be started in to reach the database."
  value       = var.subnet_ids
}

output "api_security_group_id" {
  description = "Security group a one-off task must carry to reach the database."
  value       = var.api_security_group_id
}

output "internal_task_secret_parameter" {
  description = "SSM parameter holding the bearer token the sweep presents to the API."
  value       = aws_ssm_parameter.internal_task_secret.name
}

output "internal_task_secret_arn" {
  description = "ARN of that parameter, for the sweep function's execution role."
  value       = aws_ssm_parameter.internal_task_secret.arn
}

output "api_task_role_arn" {
  description = "The application's identity in AWS."
  value       = aws_iam_role.api_task.arn
}

output "execution_role_arn" {
  description = "Role the ECS agent uses to pull images and resolve container secrets."
  value       = aws_iam_role.execution.arn
}

output "api_log_group_name" {
  description = "Where the API writes. The PDF-fallback metric filter reads it."
  value       = aws_cloudwatch_log_group.api.name
}

output "web_log_group_name" {
  description = "Where the web app writes."
  value       = aws_cloudwatch_log_group.web.name
}

output "sweep_log_group_name" {
  description = "Where the hourly sweep writes its one status line per run."
  value       = aws_cloudwatch_log_group.sweep.name
}

output "migrate_log_group_name" {
  description = "Where `make migrate-<env>` writes. Separate from the API's on purpose."
  value       = aws_cloudwatch_log_group.migrate.name
}
