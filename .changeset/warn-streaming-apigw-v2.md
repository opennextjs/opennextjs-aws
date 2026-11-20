---
"@opennextjs/aws": patch
---

fix: warn that `aws-lambda-streaming` does not work behind an API Gateway HTTP API (v2)

The wrapper only supports streaming through a Lambda function URL. Using it behind an API Gateway v2 returns a 500, so the build now logs a warning pointing to the `aws-apigw-streaming` wrapper with a REST API instead.
