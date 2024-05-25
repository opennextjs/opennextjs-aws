import { AwsClient } from "aws4fetch";
import path from "path";
import { IgnorableError, RecoverableError } from "utils/error";

import { parseNumberFromEnv } from "../../adapters/util";
import { Extension } from "../next-types";
import { IncrementalCache } from "./types";

const {
  CACHE_BUCKET_REGION,
  CACHE_BUCKET_KEY_PREFIX,
  NEXT_BUILD_ID,
  CACHE_BUCKET_NAME,
} = process.env;

const awsClient = new AwsClient({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: CACHE_BUCKET_REGION,
  retries: parseNumberFromEnv(process.env.AWS_SDK_S3_MAX_ATTEMPTS),
});

function buildS3Key(key: string, extension: Extension) {
  return path.posix.join(
    CACHE_BUCKET_KEY_PREFIX ?? "",
    extension === "fetch" ? "__fetch" : "",
    NEXT_BUILD_ID ?? "",
    extension === "fetch" ? key : `${key}.${extension}`,
  );
}

const incrementalCache: IncrementalCache = {
  async get(key, isFetch) {
    const result = await awsClient.fetch(
      `https://${CACHE_BUCKET_NAME}.s3.${CACHE_BUCKET_REGION}.amazonaws.com/${buildS3Key(
        key,
        isFetch ? "fetch" : "cache",
      )}`,
    );

    const cacheData = JSON.parse((await result.text()) ?? "{}");
    if (result.status === 404) {
      throw new IgnorableError("Not found");
    } else if (result.status !== 200) {
      throw new RecoverableError(`Failed to get cache: ${result.status}`);
    } else
      return {
        value: cacheData,
        lastModified: new Date(
          result.headers.get("last-modified") ?? "",
        ).getTime(),
      };
  },
  async set(key, value, isFetch): Promise<void> {
    const response = await awsClient.fetch(
      `https://${CACHE_BUCKET_NAME}.s3.${CACHE_BUCKET_REGION}.amazonaws.com/${buildS3Key(
        key,
        isFetch ? "fetch" : "cache",
      )}`,
      {
        method: "PUT",
        body: JSON.stringify(value),
      },
    );
    if (response.status !== 200) {
      throw new RecoverableError(`Failed to set cache: ${response.status}`);
    }
  },
  async delete(key): Promise<void> {
    const response = await awsClient.fetch(
      `https://${CACHE_BUCKET_NAME}.s3.${CACHE_BUCKET_REGION}.amazonaws.com/${buildS3Key(
        key,
        "cache",
      )}`,
      {
        method: "DELETE",
      },
    );
    if (response.status !== 204) {
      throw new RecoverableError(`Failed to delete cache: ${response.status}`);
    }
  },
  name: "s3",
};

export default incrementalCache;
