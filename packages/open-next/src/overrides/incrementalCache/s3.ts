import path from "node:path";

import type { S3ClientConfig } from "@aws-sdk/client-s3";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { CacheKey, IncrementalCache } from "types/overrides";

import { awsLogger } from "../../adapters/logger";
import { parseNumberFromEnv } from "../../adapters/util";

const { CACHE_BUCKET_REGION, CACHE_BUCKET_KEY_PREFIX, CACHE_BUCKET_NAME } =
  process.env;

function parseS3ClientConfigFromEnv(): S3ClientConfig {
  return {
    region: CACHE_BUCKET_REGION,
    logger: awsLogger,
    maxAttempts: parseNumberFromEnv(process.env.AWS_SDK_S3_MAX_ATTEMPTS),
  };
}

const s3Client = new S3Client(parseS3ClientConfigFromEnv());

function buildS3Key(key: CacheKey) {
  return path.posix.join(
    CACHE_BUCKET_KEY_PREFIX ?? "",
    key.cacheType === "fetch" ? "__fetch" : "",
    `${key.buildId ? `${key.buildId}/` : ""}${key.baseKey}.${key.cacheType}`,
  );
}

const incrementalCache: IncrementalCache = {
  async get(key) {
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: CACHE_BUCKET_NAME,
        Key: buildS3Key(key),
      }),
    );

    const cacheData = JSON.parse(
      (await result.Body?.transformToString()) ?? "{}",
    );
    return {
      value: cacheData,
      lastModified: result.LastModified?.getTime(),
    };
  },
  async set(key, value): Promise<void> {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: CACHE_BUCKET_NAME,
        Key: buildS3Key(key),
        Body: JSON.stringify(value),
      }),
    );
  },
  async delete(key): Promise<void> {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: CACHE_BUCKET_NAME,
        Key: buildS3Key(key),
      }),
    );
  },
  name: "s3",
};

export default incrementalCache;
