import { DynamoDBClient, DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import { S3Client, S3ClientConfig } from "@aws-sdk/client-s3";

import { createMainHandler } from "../core/createMainHandler.js";
import { Queue } from "../queue/types.js";
// We load every config here so that they are only loaded once
// and during cold starts
import { BuildId } from "./config/index.js";
import { awsLogger } from "./logger.js";
import { setNodeEnv } from "./util.js";

// We load every config here so that they are only loaded once
// and during cold starts
setNodeEnv();
setBuildIdEnv();
setNextjsServerWorkingDirectory();

////////////////////////
// AWS global clients //
////////////////////////

declare global {
  var S3Client: S3Client;
  var dynamoClient: DynamoDBClient;
  var queue: Queue;
}

const CACHE_BUCKET_REGION = process.env.CACHE_BUCKET_REGION;

function parseS3ClientConfigFromEnv(): S3ClientConfig {
  return {
    region: CACHE_BUCKET_REGION,
    logger: awsLogger,
    maxAttempts: parseNumberFromEnv(process.env.AWS_SDK_S3_MAX_ATTEMPTS),
  };
}

function parseDynamoClientConfigFromEnv(): DynamoDBClientConfig {
  return {
    region: CACHE_BUCKET_REGION,
    logger: awsLogger,
    maxAttempts: parseNumberFromEnv(process.env.AWS_SDK_DYNAMODB_MAX_ATTEMPTS),
  };
}

function parseNumberFromEnv(envValue: string | undefined): number | undefined {
  if (typeof envValue !== "string") {
    return envValue;
  }

  const parsedValue = parseInt(envValue);

  return isNaN(parsedValue) ? undefined : parsedValue;
}

// Cache clients using global variables
// Note: The clients are used in `cache.ts`. The incremental cache is recreated on
//       every request and required on every request (And the require cache is also
//       cleared). It was causing some file to stay open which after enough time
//       would cause the function to crash with error "EMFILE too many open". It
//       was also making the memory grow out of control.
globalThis.S3Client = new S3Client(parseS3ClientConfigFromEnv());
globalThis.dynamoClient = new DynamoDBClient(parseDynamoClientConfigFromEnv());

/////////////
// Handler //
/////////////

export const handler = await createMainHandler();

//////////////////////
// Helper functions //
//////////////////////

function setNextjsServerWorkingDirectory() {
  // WORKAROUND: Set `NextServer` working directory (AWS specific) — https://github.com/serverless-stack/open-next#workaround-set-nextserver-working-directory-aws-specific
  process.chdir(__dirname);
}

function setBuildIdEnv() {
  // This allows users to access the CloudFront invalidating path when doing on-demand
  // invalidations. ie. `/_next/data/${process.env.NEXT_BUILD_ID}/foo.json`
  process.env.NEXT_BUILD_ID = BuildId;
}
