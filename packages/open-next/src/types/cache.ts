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

export type Extension = "cache" | "fetch";

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

// Cache context since https://github.com/vercel/next.js/pull/76207
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

// Before #76207 revalidate was passed this way
interface SetIncrementalCacheContext {
  revalidate?: number | false;
  isRoutePPREnabled?: boolean;
  isFallback?: boolean;
}

// Before https://github.com/vercel/next.js/pull/53321 context on set was just the revalidate
type OldSetIncrementalCacheContext = number | false | undefined;

export type IncrementalCacheContext =
  | OldSetIncrementalCacheContext
  | SetIncrementalCacheContext
  | SetIncrementalFetchCacheContext
  | SetIncrementalResponseCacheContext;
