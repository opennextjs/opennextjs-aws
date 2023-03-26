import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  PutObjectCommandInput,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

interface CachedFetchValue {
  kind: "FETCH";
  data: {
    headers: { [k: string]: string };
    body: string;
    status?: number;
  };
  revalidate: number;
}

interface CachedRedirectValue {
  kind: "REDIRECT";
  props: Object;
}

interface CachedRouteValue {
  kind: "ROUTE";
  // this needs to be a RenderResult so since renderResponse
  // expects that type instead of a string
  body: Buffer;
  status: number;
  headers: Record<string, undefined | string | string[]>;
}

interface CachedImageValue {
  kind: "IMAGE";
  etag: string;
  buffer: Buffer;
  extension: string;
  isMiss?: boolean;
  isStale?: boolean;
}

interface IncrementalCachedPageValue {
  kind: "PAGE";
  // this needs to be a string since the cache expects to store
  // the string value
  html: string;
  pageData: Object;
}

type IncrementalCacheValue =
  | CachedRedirectValue
  | IncrementalCachedPageValue
  | CachedImageValue
  | CachedFetchValue
  | CachedRouteValue;

interface CacheHandlerContext {
  fs?: never;
  dev?: boolean;
  flushToDisk?: boolean;
  serverDistDir?: string;
  maxMemoryCacheSize?: number;
  _appDir: boolean;
  _requestHeaders: never;
  fetchCacheKeyPrefix?: string;
}

interface CacheHandlerValue {
  lastModified?: number;
  age?: number;
  cacheState?: string;
  value: IncrementalCacheValue | null;
}

export default class S3Cache {
  private client: S3Client;
  constructor(_ctx: CacheHandlerContext) {
    this.client = new S3Client({});
  }

  async get(key: string): Promise<CacheHandlerValue | null> {
    const { Contents } = await this.client.send(
      new ListObjectsV2Command({
        Bucket: process.env.CACHE_BUCKET_NAME,
        Prefix: `${key}.`,
      })
    );
    const keys = Contents?.map(({ Key }) => Key);
    if (!keys?.length) {
      return null;
    }
    if (keys.includes(`${key}.body`)) {
      try {
        const { Body, LastModified } = await this.getS3Object(`${key}.body`);
        const body = await Body?.transformToByteArray();

        const { Body: metaBody } = await this.getS3Object(`${key}.meta`);
        const meta = JSON.parse((await metaBody?.transformToString()) ?? "{}");

        const cacheEntry: CacheHandlerValue = {
          lastModified: LastModified?.getTime(),
          value: {
            kind: "ROUTE",
            body: Buffer.from(body ?? Buffer.alloc(0)),
            status: meta.status,
            headers: meta.headers,
          },
        };
        return cacheEntry;
      } catch (_) {
        // no .meta data for the related key
      }
    }
    try {
      const { Body, LastModified } = await this.getS3Object(`${key}.body`);

      const pageData = keys.includes(`${key}.json`)
        ? JSON.parse(
            (await (await this.getS3Object(`${key}.json`)).Body?.transformToString()) ??
              "{}"
          )
        : Buffer.from(
            (await (await this.getS3Object(`${key}.rsc`)).Body?.transformToByteArray()) ??
              Buffer.alloc(0)
          );

      const cacheEntry: CacheHandlerValue = {
        lastModified: LastModified?.getTime(),
        value: {
          kind: "PAGE",
          html: (await Body?.transformToString()) ?? "",
          pageData,
        },
      };
      return cacheEntry;
    } catch (_) {
      return null;
    }
  }

  async set(key: string, data?: IncrementalCacheValue): Promise<void> {
    if (data?.kind === "ROUTE") {
      const { body, status, headers } = data;
      await this.putS3Object(`${key}.body`, body);
      await this.putS3Object(`${key}.meta`, JSON.stringify({ status, headers }));
    }
    if (data?.kind === "PAGE") {
      const { html, pageData } = data;
      await this.putS3Object(`${key}.html`, html);
      const isAppPath = typeof pageData === "string";
      await this.putS3Object(
        isAppPath ? `${key}.rsc` : `${key}.json`,
        isAppPath ? pageData : JSON.stringify(pageData)
      );
    }
  }

  private async getS3Object(key: string) {
    return this.client.send(
      new GetObjectCommand({
        Bucket: process.env.CACHE_BUCKET_NAME,
        Key: key,
      })
    );
  }

  private async putS3Object(key: string, value: PutObjectCommandInput["Body"]) {
    return this.client.send(
      new PutObjectCommand({
        Bucket: process.env.CACHE_BUCKET_NAME,
        Key: key,
        Body: value,
      })
    );
  }
}
