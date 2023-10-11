/* eslint-disable unused-imports/no-unused-imports */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

// We load every config here so that they are only loaded once
// and during cold starts
import {
  AppPathsManifestKeys,
  BuildId,
  ConfigHeaders,
  HtmlPages,
  NEXT_DIR,
  NextConfig,
  OPEN_NEXT_DIR,
  PrerenderManifest,
  PublicAssets,
  RoutesManifest,
} from "./config/index.js";
import { awsLogger } from "./logger.js";
import { lambdaHandler } from "./plugins/lambdaHandler.js";
import { setNodeEnv } from "./util.js";

setNodeEnv();
setBuildIdEnv();
setNextjsServerWorkingDirectory();

///////////////////////
// AWS global client //
///////////////////////

declare global {
  var S3Client: S3Client;
  var dynamoClient: DynamoDBClient;
}

const CACHE_BUCKET_REGION = process.env.CACHE_BUCKET_REGION;

// Cache clients using global variables
// Note: The clients are used in `cache.ts`. The incremental cache is recreated on
//       every request and required on every request (And the require cache is also
//       cleared). It was causing some file to stay open which after enough time
//       would cause the function to crash with error "EMFILE too many open". It
//       was also making the memory grow out of control.
globalThis.S3Client = new S3Client({
  region: CACHE_BUCKET_REGION,
  logger: awsLogger,
});
globalThis.dynamoClient = new DynamoDBClient({
  region: CACHE_BUCKET_REGION,
  logger: awsLogger,
});

/////////////
// Handler //
/////////////

export const handler = lambdaHandler;

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
