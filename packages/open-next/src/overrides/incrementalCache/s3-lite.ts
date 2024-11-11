/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path from "node:path";

import { AwsClient } from "aws4fetch";
import type { Extension } from "types/cache";
import type { IncrementalCache } from "types/overrides";
import { IgnorableError, RecoverableError } from "utils/error";
import { customFetchClient } from "utils/fetch";

import { parseNumberFromEnv } from "../../adapters/util";

let awsClient: AwsClient | null = null;

const getAwsClient = () => {
  const { CACHE_BUCKET_REGION } = process.env;
  if (awsClient) {
    return awsClient;
  }
  awsClient = new AwsClient({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: CACHE_BUCKET_REGION,
    retries: parseNumberFromEnv(process.env.AWS_SDK_S3_MAX_ATTEMPTS),
  });
  return awsClient;
};

const awsFetch = async (key: string, options: RequestInit) => {
  const { CACHE_BUCKET_REGION, CACHE_BUCKET_NAME } = process.env;
  const client = getAwsClient();
  const url = `https://${CACHE_BUCKET_NAME}.s3.${CACHE_BUCKET_REGION}.amazonaws.com/${key}`;
  return customFetchClient(client)(url, options);
};

function buildS3Key(key: string, extension: Extension) {
  const { CACHE_BUCKET_KEY_PREFIX, NEXT_BUILD_ID } = process.env;
  return path.posix.join(
    CACHE_BUCKET_KEY_PREFIX ?? "",
    extension === "fetch" ? "__fetch" : "",
    NEXT_BUILD_ID ?? "",
    extension === "fetch" ? key : `${key}.${extension}`,
  );
}

const incrementalCache: IncrementalCache = {
  async get(key, isFetch) {
    const result = await awsFetch(
      buildS3Key(key, isFetch ? "fetch" : "cache"),
      {
        method: "GET",
      },
    );

    if (result.status === 404) {
      throw new IgnorableError("Not found");
    }
    if (result.status !== 200) {
      throw new RecoverableError(`Failed to get cache: ${result.status}`);
    }
    const cacheData: any = await result.json();
    return {
      value: cacheData,
      lastModified: new Date(
        result.headers.get("last-modified") ?? "",
      ).getTime(),
    };
  },
  async set(key, value, isFetch): Promise<void> {
    const response = await awsFetch(
      buildS3Key(key, isFetch ? "fetch" : "cache"),
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
    const response = await awsFetch(buildS3Key(key, "cache"), {
      method: "DELETE",
    });
    if (response.status !== 204) {
      throw new RecoverableError(`Failed to delete cache: ${response.status}`);
    }
  },
  name: "s3",
};

export default incrementalCache;
