import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  PutObjectCommandInput,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import path from "node:path";
import { error, awsLogger } from "./logger.js";
import { loadBuildId } from "./util.js";

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

type Extension = "json" | "html" | "rsc" | "body" | "meta" | "fetch";

// Expected environment variables
const { CACHE_BUCKET_NAME, CACHE_BUCKET_KEY_PREFIX, CACHE_BUCKET_REGION } =
  process.env;

export default class S3Cache {
  private client: S3Client;
  private buildId: string;

  constructor(_ctx: CacheHandlerContext) {
    this.client = new S3Client({
      region: CACHE_BUCKET_REGION,
      logger: awsLogger,
    });
    this.buildId = loadBuildId(
      path.dirname(_ctx.serverDistDir ?? ".next/server")
    );
  }

  async get(key: string, fetchCache?: boolean) {
    return fetchCache ? this.getFetchCache(key) : this.getIncrementalCache(key);
  }

  async getFetchCache(key: string) {
    try {
      const { Body, LastModified } = await this.getS3Object(key, "fetch");
      return {
        lastModified: LastModified?.getTime(),
        value: JSON.parse((await Body?.transformToString()) ?? "{}"),
      } as CacheHandlerValue;
    } catch (e) {
      error("Failed to get fetch cache", e);
      return null;
    }
  }

  async getIncrementalCache(key: string): Promise<CacheHandlerValue | null> {
    const { Contents } = await this.listS3Objects(key);
    const keys = (Contents ?? []).map(({ Key }) => Key);

    if (keys.includes(this.buildS3Key(key, "body"))) {
      try {
        const [{ Body, LastModified }, { Body: MetaBody }] = await Promise.all([
          this.getS3Object(key, "body"),
          this.getS3Object(key, "meta"),
        ]);
        const body = await Body?.transformToByteArray();
        const meta = JSON.parse((await MetaBody?.transformToString()) ?? "{}");

        return {
          lastModified: LastModified?.getTime(),
          value: {
            kind: "ROUTE",
            body: Buffer.from(body ?? Buffer.alloc(0)),
            status: meta.status,
            headers: meta.headers,
          },
        } as CacheHandlerValue;
      } catch (e) {
        error("Failed to get body cache", e);
      }
      return null;
    }

    if (keys.includes(this.buildS3Key(key, "html"))) {
      const isJson = keys.includes(this.buildS3Key(key, "json"));
      const isRsc = keys.includes(this.buildS3Key(key, "rsc"));
      if (!isJson && !isRsc) return null;

      try {
        const [{ Body, LastModified }, { Body: PageBody }] = await Promise.all([
          this.getS3Object(key, "html"),
          this.getS3Object(key, isJson ? "json" : "rsc"),
        ]);

        return {
          lastModified: LastModified?.getTime(),
          value: {
            kind: "PAGE",
            html: (await Body?.transformToString()) ?? "",
            pageData: isJson
              ? JSON.parse((await PageBody?.transformToString()) ?? "{}")
              : await PageBody?.transformToString(),
          },
        } as CacheHandlerValue;
      } catch (e) {
        error("Failed to get html cache", e);
      }
      return null;
    }
    return null;
  }

  async set(key: string, data?: IncrementalCacheValue): Promise<void> {
    if (data?.kind === "ROUTE") {
      const { body, status, headers } = data;
      await Promise.all([
        this.putS3Object(key, "body", body),
        this.putS3Object(key, "meta", JSON.stringify({ status, headers })),
      ]);
    } else if (data?.kind === "PAGE") {
      const { html, pageData } = data;
      const isAppPath = typeof pageData === "string";
      await Promise.all([
        this.putS3Object(key, "html", html),
        this.putS3Object(
          key,
          isAppPath ? "rsc" : "json",
          isAppPath ? pageData : JSON.stringify(pageData)
        ),
      ]);
    } else if (data?.kind === "FETCH") {
      await this.putS3Object(key, "fetch", JSON.stringify(data));
    }
  }

  private buildS3Key(key: string, extension: Extension) {
    return path.posix.join(
      CACHE_BUCKET_KEY_PREFIX ?? "",
      extension === "fetch" ? "__fetch" : "",
      this.buildId,
      extension === "fetch" ? key : `${key}.${extension}`
    );
  }

  private buildS3KeyPrefix(key: string) {
    return path.posix.join(CACHE_BUCKET_KEY_PREFIX ?? "", this.buildId, key);
  }

  private listS3Objects(key: string) {
    return this.client.send(
      new ListObjectsV2Command({
        Bucket: CACHE_BUCKET_NAME,
        Prefix: this.buildS3KeyPrefix(key),
      })
    );
  }

  private getS3Object(key: string, extension: Extension) {
    return this.client.send(
      new GetObjectCommand({
        Bucket: CACHE_BUCKET_NAME,
        Key: this.buildS3Key(key, extension),
      })
    );
  }

  private putS3Object(
    key: string,
    extension: Extension,
    value: PutObjectCommandInput["Body"]
  ) {
    return this.client.send(
      new PutObjectCommand({
        Bucket: CACHE_BUCKET_NAME,
        Key: this.buildS3Key(key, extension),
        Body: value,
      })
    );
  }
}
