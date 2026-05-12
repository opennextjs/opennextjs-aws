# CloudFormation / Serverless Deployment for OpenNext on AWS

This example provides a `serverless.yml` template to deploy an OpenNext application using the Serverless Framework. It generates a CloudFormation stack that provisions AWS resources including Lambda functions, API Gateway, S3 buckets, and CloudFront.

## Prerequisites

- Node.js 18 or later
- AWS CLI configured with appropriate credentials (see `aws configure`)
- Serverless Framework installed globally: `npm install -g serverless`
- An OpenNext application built with `open-next build`

## Template Overview

The `serverless.yml` file defines:
- **Lambda functions** for server rendering, image optimization, and API routes
- **API Gateway** as the HTTP trigger
- **S3 bucket** for static assets and file uploads
- **CloudFront distribution** for global caching and custom domain support

## Deployment Steps

1. Navigate to your project root (where `open-next.config.js` exists)
2. Build the OpenNext output:
   ```bash
   npx open-next build
   ```
3. Copy the provided `serverless.yml` into your project or reference it from `examples/cloudformation/`
4. Install required plugins:
   ```bash
   npm install --save-dev serverless-s3-sync serverless-cloudfront-invalidate
   ```
5. Deploy the stack:
   ```bash
   serverless deploy --stage prod --region us-east-1
   ```
6. After deployment, the endpoint URL will be displayed (e.g., `https://xxxxxxxxxx.cloudfront.net`)

## Important Configuration Notes

- **Environment variables**: Add any required environment variables to `provider.environment` in `serverless.yml`
- **IAM permissions**: The default policy grants minimal access. For advanced use (S3 uploads, DynamoDB, etc.), extend `provider.iamRoleStatements`
- **Custom domain**: Configure `customDomain` under `custom` and add the domain to `plugins` – requires `serverless-domain-manager` plugin
- **Single-table architecture**: If using DynamoDB, define tables in `resources.Resources`
- **Static assets**: The S3 bucket name is auto-generated. To use a custom bucket, set `provider.deploymentBucket.name`
- **Cost considerations**: API Gateway and CloudFront incur monthly costs. Use `serverless remove` to delete resources when not needed

## Troubleshooting

- **`open-next` not found**: Ensure `open-next` is installed locally (`npm install open-next`)
- **Lambda size too large**: Exclude `node_modules` from `package.patterns` or use Lambda layers
- **Missing environment variables**: Check that `provider.environment` includes all variables referenced in your app

## Cleanup

To delete all deployed resources:
```bash
serverless remove --stage prod --region us-east-1
```

For more details, refer to the [OpenNext AWS deployment guide](https://opennext.js.org/aws).
