import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { AwsClient } from "aws4fetch";

import type { ImageLoader } from "types/overrides";
import { FatalError, IgnorableError, RecoverableError } from "utils/error";

let awsClient: AwsClient | null = null;

const { BUCKET_NAME, BUCKET_KEY_PREFIX } = process.env;
const BUCKET_REGION =
  process.env.BUCKET_REGION ?? process.env.AWS_DEFAULT_REGION;

const getAwsClient = () => {
  if (awsClient) {
    return awsClient;
  }
  awsClient = new AwsClient({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: BUCKET_REGION,
  });
  return awsClient;
};

function ensureEnvExists() {
  if (!(BUCKET_NAME || BUCKET_KEY_PREFIX || BUCKET_REGION)) {
    throw new FatalError("Bucket name, region and key prefix must be defined!");
  }
}

const awsFetch = async (key: string, options: RequestInit) => {
  const client = getAwsClient();
  const url = `https://${BUCKET_NAME}.s3.${BUCKET_REGION}.amazonaws.com/${key}`;
  return client.fetch(url, options);
};

const s3Loader: ImageLoader = {
  name: "s3-lite",
  load: async (key: string) => {
    ensureEnvExists();
    const keyPrefix = BUCKET_KEY_PREFIX?.replace(/^\/|\/$/g, "");
    const response = await awsFetch(
      keyPrefix
        ? `${keyPrefix}/${key.replace(/^\//, "")}`
        : key.replace(/^\//, ""),
      {
        method: "GET",
      },
    );

    if (response.status === 404) {
      throw new IgnorableError("The specified key does not exist.");
    }
    if (response.status !== 200) {
      throw new RecoverableError(
        `Failed to get image. Status code: ${response.status}`,
      );
    }

    if (!response.body) {
      throw new FatalError("No body in aws4fetch s3 response");
    }

    // We need to cast it else there will be a TypeError: o.pipe is not a function
    const body = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);

    return {
      body: body,
      contentType: response.headers.get("content-type") ?? undefined,
      cacheControl: response.headers.get("cache-control") ?? undefined,
    };
  },
};

export default s3Loader;
