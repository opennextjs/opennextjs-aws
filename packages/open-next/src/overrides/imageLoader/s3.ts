import type { Readable } from "node:stream";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ImageLoader } from "types/overrides";
import { FatalError, IgnorableError } from "utils/error";

import { awsLogger, error } from "../../adapters/logger";

const { BUCKET_NAME, BUCKET_KEY_PREFIX } = process.env;

function ensureBucketExists() {
  if (!BUCKET_NAME) {
    throw new FatalError("Bucket name must be defined!");
  }
}

const s3Loader: ImageLoader = {
  name: "s3",
  load: async (key: string) => {
    try {
      const s3Client = new S3Client({ logger: awsLogger });

      ensureBucketExists();
      const keyPrefix = BUCKET_KEY_PREFIX?.replace(/^\/|\/$/g, "");
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: keyPrefix
            ? `${keyPrefix}/${key.replace(/^\//, "")}`
            : key.replace(/^\//, ""),
        }),
      );
      const body = response.Body as Readable | undefined;

      if (!body) {
        throw new FatalError("No body in S3 response");
      }

      return {
        body: body,
        contentType: response.ContentType,
        cacheControl: response.CacheControl,
      };
    } catch (e: any) {
      if (e instanceof FatalError) {
        throw e;
      }
      // Special handling for S3 ListBucket permission errors
      // AWS SDK v3 nests error details deeply within the error object
      const isListBucketError =
        (e.message.includes("s3:ListBucket") &&
          e.message.includes("AccessDenied")) ||
        e.error?.message?.includes("s3:ListBucket") ||
        (e.Code === "AccessDenied" && e.Message?.includes("s3:ListBucket"));

      if (isListBucketError) {
        const statusCode =
          e.statusCode === 500 && e.$metadata?.httpStatusCode === 403
            ? 403
            : 500;
        throw new IgnorableError(
          "Image not found or access denied",
          statusCode,
        );
      }
      error("Failed to load image from S3", e);
      throw new FatalError("Failed to load image from S3");
    }
  },
};

export default s3Loader;
