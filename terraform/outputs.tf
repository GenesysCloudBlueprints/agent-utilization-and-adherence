output "function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.genesys_function.function_name
}

output "function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.genesys_function.arn
}

output "schedule_arn" {
  description = "EventBridge schedule ARN"
  value       = aws_cloudwatch_event_rule.every_15_minutes.arn
}