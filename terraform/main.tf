terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_cloudwatch_log_group" "genesys_logs" {
  name              = "/aws/lambda/genesys-presence-updater"
  retention_in_days = 14
}

resource "aws_iam_role" "lambda_role" {
  name = "genesys-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_role.name
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_file = "../lambda-genesys.js"
  output_path = "genesys-lambda.zip"
}

resource "aws_lambda_function" "genesys_function" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "genesys-presence-updater"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda-genesys.handler"
  runtime         = "nodejs18.x"
  timeout         = 60
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {
    variables = {
      GENESYS_CLOUD_CLIENT_ID     = var.genesys_client_id
      GENESYS_CLOUD_CLIENT_SECRET = var.genesys_client_secret
      MANAGEMENT_UNIT_ID          = var.management_unit_id
      PRE_BREAK_PRESENCE_ID       = var.pre_break_presence_id
    }
  }

  depends_on = [aws_cloudwatch_log_group.genesys_logs]
}

resource "aws_cloudwatch_event_rule" "every_15_minutes" {
  name                = "genesys-presence-schedule"
  description         = "Runs Genesys presence updater every 15 minutes"
  schedule_expression = "rate(15 minutes)"
}

resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.every_15_minutes.name
  target_id = "GenesysTarget"
  arn       = aws_lambda_function.genesys_function.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.genesys_function.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.every_15_minutes.arn
}