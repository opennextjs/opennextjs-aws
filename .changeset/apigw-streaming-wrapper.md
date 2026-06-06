---
"@opennextjs/aws": minor
---

Add `aws-apigw-streaming` wrapper for API Gateway response streaming

A new built-in streaming wrapper for fronting the server function with an API Gateway REST API in `ResponseTransferMode: STREAM` (now [supported by AWS](https://aws.amazon.com/about-aws/whats-new/2025/11/api-gateway-response-streaming-rest-apis/)), rather than a Lambda Function URL. Unlike `aws-lambda-streaming`, it omits the Function-URL-only `application/vnd.awslambda.http-integration-response` content type and never compresses the body (API Gateway streaming does not support content encoding). Pairs with `aws-apigw-v1` (REST) or `aws-apigw-v2` (HTTP) converters.
