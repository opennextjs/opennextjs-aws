import path from "node:path";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";

import { awsLogger, debug, error } from "./logger.js";
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

type Extension =
  | "json"
  | "html"
  | "rsc"
  | "body"
  | "meta"
  | "fetch"
  | "redirect";

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
      path.dirname(_ctx.serverDistDir ?? ".next/server"),
    );
  }

  async get(key: string, fetchCache?: boolean) {
    return fetchCache ? this.getFetchCache(key) : this.getIncrementalCache(key);
  }

  async getFetchCache(key: string) {
    debug("get fetch cache", { key });
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
    const keys = await this.listS3Object(key);
    if (keys.length === 0) return null;
    debug("keys", keys);

    if (keys.includes(this.buildS3Key(key, "body"))) {
      debug("get body cache ", { key });
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
      debug("get html cache ", { key, isJson, isRsc });
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

    // Check for redirect last. This way if a page has been regenerated
    // after having been redirected, we'll get the page data
    if (keys.includes(this.buildS3Key(key, "redirect"))) {
      debug("get redirect cache", { key });
      try {
        const { Body, LastModified } = await this.getS3Object(key, "redirect");
        return {
          lastModified: LastModified?.getTime(),
          value: JSON.parse((await Body?.transformToString()) ?? "{}"),
        };
      } catch (e) {
        error("Failed to get redirect cache", e);
      }
      return null;
    }

    return null;
  }

  async set(key: string, data?: IncrementalCacheValue | null): Promise<void> {
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
          isAppPath ? pageData : JSON.stringify(pageData),
        ),
      ]);
    } else if (data?.kind === "FETCH") {
      await this.putS3Object(key, "fetch", JSON.stringify(data));
    } else if (data?.kind === "REDIRECT") {
      // delete potential page data if we're redirecting
      await this.deleteS3Objects(key);
      await this.putS3Object(key, "redirect", JSON.stringify(data));
    } else if (data === null || data === undefined) {
      await this.deleteS3Objects(key);
    }
  }

  private buildS3Key(key: string, extension: Extension) {
    return path.posix.join(
      CACHE_BUCKET_KEY_PREFIX ?? "",
      extension === "fetch" ? "__fetch" : "",
      this.buildId,
      extension === "fetch" ? key : `${key}.${extension}`,
    );
  }

  private buildS3KeyPrefix(key: string) {
    return path.posix.join(CACHE_BUCKET_KEY_PREFIX ?? "", this.buildId, key);
  }

  private async listS3Object(key: string) {
    const { Contents } = await this.client.send(
      new ListObjectsV2Command({
        Bucket: CACHE_BUCKET_NAME,
        // add a point to the key so that it only matches the key and
        // not other keys starting with the same string
        Prefix: `${this.buildS3KeyPrefix(key)}.`,
      }),
    );
    return (Contents ?? []).map(({ Key }) => Key);
  }

  private getS3Object(key: string, extension: Extension) {
    return this.client.send(
      new GetObjectCommand({
        Bucket: CACHE_BUCKET_NAME,
        Key: this.buildS3Key(key, extension),
      }),
    );
  }

  private putS3Object(
    key: string,
    extension: Extension,
    value: PutObjectCommandInput["Body"],
  ) {
    return this.client.send(
      new PutObjectCommand({
        Bucket: CACHE_BUCKET_NAME,
        Key: this.buildS3Key(key, extension),
        Body: value,
      }),
    );
  }

  private async deleteS3Objects(key: string) {
    try {
      const regex = new RegExp(`\.(json|rsc|html|body|meta|fetch|redirect)$`);
      const s3Keys = (await this.listS3Object(key)).filter(
        (key) => key && regex.test(key),
      );

      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: CACHE_BUCKET_NAME,
          Delete: {
            Objects: s3Keys.map((Key) => ({ Key })),
          },
        }),
      );
    } catch (e) {
      error("Failed to delete cache", e);
    }
  }
}
