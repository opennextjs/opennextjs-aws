import { AwsClient } from "aws4fetch";
import path from "path";

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
    // const result = await s3Client.send(
    //   new GetObjectCommand({
    //     Bucket: CACHE_BUCKET_NAME,
    //     Key: buildS3Key(key, isFetch ? "fetch" : "cache"),
    //   }),
    // );

    const cacheData = JSON.parse((await result.text()) ?? "{}");
    console.log("cacheData", cacheData);
    console.log("headers", result.headers.get("last-modified") ?? "");
    return {
      value: cacheData,
      lastModified: new Date(
        result.headers.get("last-modified") ?? "",
      ).getTime(),
    };
  },
  async set(key, value, isFetch): Promise<void> {
    const result = await awsClient.fetch(
      `https://${CACHE_BUCKET_NAME}.s3.${CACHE_BUCKET_REGION}.amazonaws.com/${buildS3Key(
        key,
        isFetch ? "fetch" : "cache",
      )}`,
      {
        method: "PUT",
        body: JSON.stringify(value),
      },
    );
    const textResult = await result.text();
    console.log("set result", result.status, textResult);
  },
  async delete(key): Promise<void> {
    const result = await awsClient.fetch(
      `https://${CACHE_BUCKET_NAME}.s3.${CACHE_BUCKET_REGION}.amazonaws.com/${buildS3Key(
        key,
        "cache",
      )}`,
      {
        method: "DELETE",
      },
    );
    const textResult = await result.text();
    console.log("delete result", result.status, textResult);
  },
  name: "s3",
};

export default incrementalCache;
