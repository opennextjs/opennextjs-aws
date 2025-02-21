import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { AwsClient } from "aws4fetch";

import type { ImageLoader } from "types/overrides";
import { FatalError } from "utils/error";
import { customFetchClient } from "utils/fetch";

let awsClient: AwsClient | null = null;

const getAwsClient = () => {
  if (awsClient) {
    return awsClient;
  }
  awsClient = new AwsClient({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: process.env.BUCKET_REGION,
  });
  return awsClient;
};

const { BUCKET_NAME, BUCKET_KEY_PREFIX, BUCKET_REGION } = process.env;

function ensureEnvExists() {
  if (!(BUCKET_NAME || BUCKET_REGION || BUCKET_KEY_PREFIX)) {
    throw new Error("Bucket name, region and key prefix must be defined!");
  }
}

const awsFetch = async (key: string, options: RequestInit) => {
  const client = getAwsClient();
  const url = `https://${BUCKET_NAME}.s3.${BUCKET_REGION}.amazonaws.com/${key}`;
  return customFetchClient(client)(url, options);
};

const s3Loader: ImageLoader = {
  name: "s3",
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
