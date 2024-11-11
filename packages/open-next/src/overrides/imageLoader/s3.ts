import type { Readable } from "node:stream";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ImageLoader } from "types/overrides";
import { FatalError } from "utils/error";

import { awsLogger } from "../../adapters/logger";

const { BUCKET_NAME, BUCKET_KEY_PREFIX } = process.env;

function ensureBucketExists() {
  if (!BUCKET_NAME) {
    throw new Error("Bucket name must be defined!");
  }
}

const s3Loader: ImageLoader = {
  name: "s3",
  load: async (key: string) => {
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
  },
};

export default s3Loader;
