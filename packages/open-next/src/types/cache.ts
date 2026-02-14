interface CachedFetchValue {
  kind: "FETCH";
  data: {
    headers: { [k: string]: string };
    body: string;
    url: string;
    status?: number;
    tags?: string[];
  };
  revalidate: number;
}

interface CachedRedirectValue {
  kind: "REDIRECT";
  props: Object;
}

interface CachedRouteValue {
  kind: "ROUTE" | "APP_ROUTE";
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
  kind: "PAGE" | "PAGES";
  // this needs to be a string since the cache expects to store
  // the string value
  html: string;
  pageData: Object;
  status?: number;
  headers?: Record<string, undefined | string>;
}

interface IncrementalCachedAppPageValue {
  kind: "APP_PAGE";
  // this needs to be a string since the cache expects to store
  // the string value
  html: string;
  rscData: Buffer;
  headers?: Record<string, undefined | string | string[]>;
  postponed?: string;
  status?: number;
  segmentData?: Map<string, Buffer>;
}

export type IncrementalCacheValue =
  | CachedRedirectValue
  | IncrementalCachedPageValue
  | IncrementalCachedAppPageValue
  | CachedImageValue
  | CachedFetchValue
  | CachedRouteValue;

export interface CacheHandlerContext {
  fs?: never;
  dev?: boolean;
  flushToDisk?: boolean;
  serverDistDir?: string;
  maxMemoryCacheSize?: number;
  _appDir: boolean;
  _requestHeaders: never;
  fetchCacheKeyPrefix?: string;
}
export interface CacheHandlerValue {
  lastModified?: number;
  age?: number;
  cacheState?: string;
  value: IncrementalCacheValue | null;
}

export type Extension = "cache" | "fetch" | "composable";

type MetaHeaders = {
  "x-next-cache-tags"?: string;
  [k: string]: string | string[] | undefined;
};

export interface Meta {
  status?: number;
  headers?: MetaHeaders;
  postponed?: string;
}

export type TagCacheMetaFile = {
  tag: { S: string };
  path: { S: string };
  revalidatedAt: { N: string };
};

// Cache context since vercel/next.js#76207
interface SetIncrementalFetchCacheContext {
  fetchCache: true;
  fetchUrl?: string;
  fetchIdx?: number;
  tags?: string[];
}

interface SetIncrementalResponseCacheContext {
  fetchCache?: false;
  cacheControl?: {
    revalidate: number | false;
    expire?: number;
  };

  /**
   * True if the route is enabled for PPR.
   */
  isRoutePPREnabled?: boolean;

  /**
   * True if this is a fallback request.
   */
  isFallback?: boolean;
}

// Before vercel/next.js#76207 revalidate was passed this way
interface SetIncrementalCacheContext {
  revalidate?: number | false;
  isRoutePPREnabled?: boolean;
  isFallback?: boolean;
}

// Before vercel/next.js#53321 context on set was just the revalidate
type OldSetIncrementalCacheContext = number | false | undefined;

export type IncrementalCacheContext =
  | OldSetIncrementalCacheContext
  | SetIncrementalCacheContext
  | SetIncrementalFetchCacheContext
  | SetIncrementalResponseCacheContext;

export interface ComposableCacheEntry {
  value: ReadableStream<Uint8Array>;
  tags: string[];
  stale: number;
  timestamp: number;
  expire: number;
  revalidate: number;
}

export type StoredComposableCacheEntry = Omit<ComposableCacheEntry, "value"> & {
  value: Blob;
};

export interface ComposableCacheHandler {
  get(cacheKey: string): Promise<ComposableCacheEntry | undefined>;
  set(
    cacheKey: string,
    pendingEntry: Promise<ComposableCacheEntry>,
  ): Promise<void>;
  refreshTags(): Promise<void>;
  /**
   * Next 16 takes an array of tags instead of variadic arguments
   */
  getExpiration(...tags: string[] | string[][]): Promise<number>;
  /**
   * Removed from Next.js 16
   */
  expireTags(...tags: string[]): Promise<void>;
  /**
   * This function is only there for older versions and do nothing
   */
  receiveExpiredTags(...tags: string[]): Promise<void>;
}
