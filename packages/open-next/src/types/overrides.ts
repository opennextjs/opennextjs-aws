import type { Readable } from "node:stream";

import type { Meta } from "types/cache";

import type {
  BaseEventOrResult,
  BaseOverride,
  InternalEvent,
  InternalResult,
  Origin,
  ResolvedRoute,
  StreamCreator,
  WaitUntil,
} from "./open-next";

// Queue

export interface QueueMessage {
  MessageDeduplicationId: string;
  MessageBody: {
    host: string;
    url: string;
  };
  MessageGroupId: string;
}

export interface Queue {
  send(message: QueueMessage): Promise<void>;
  name: string;
}

// Incremental cache

export type CachedFile =
  | {
      type: "redirect";
      props?: Object;
      meta?: Meta;
    }
  | {
      type: "page";
      html: string;
      json: Object;
      meta?: Meta;
    }
  | {
      type: "app";
      html: string;
      rsc: string;
      meta?: Meta;
    }
  | {
      type: "route";
      body: string;
      meta?: Meta;
    };

// type taken from: https://github.com/vercel/next.js/blob/9a1cd356/packages/next/src/server/response-cache/types.ts#L26-L38
export type CachedFetchValue = {
  kind: "FETCH";
  data: {
    headers: { [k: string]: string };
    body: string;
    url: string;
    status?: number;
    // field used by older versions of Next.js (see: https://github.com/vercel/next.js/blob/fda1ecc/packages/next/src/server/response-cache/types.ts#L23)
    tags?: string[];
  };
  // tags are only present with file-system-cache
  // fetch cache stores tags outside of cache entry
  tags?: string[];
};

export type WithLastModified<T> = {
  lastModified?: number;
  value?: T;
};

export type CacheValue<IsFetch extends boolean> = (IsFetch extends true
  ? CachedFetchValue
  : CachedFile) & { revalidate?: number | false };

export type IncrementalCache = {
  get<IsFetch extends boolean = false>(
    key: string,
    isFetch?: IsFetch,
  ): Promise<WithLastModified<CacheValue<IsFetch>> | null>;
  set<IsFetch extends boolean = false>(
    key: string,
    value: CacheValue<IsFetch>,
    isFetch?: IsFetch,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  name: string;
};

// Tag cache

type BaseTagCache = {
  name: string;
};

export type NextModeTagCache = BaseTagCache & {
  mode: "nextMode";
  hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean>;
  writeTags(tags: string[]): Promise<void>;
};

export type OriginalTagCache = BaseTagCache & {
  mode?: "original";
  getByTag(tag: string): Promise<string[]>;
  getByPath(path: string): Promise<string[]>;
  getLastModified(path: string, lastModified?: number): Promise<number>;
  writeTags(
    tags: { tag: string; path: string; revalidatedAt?: number }[],
  ): Promise<void>;
};

export type TagCache = NextModeTagCache | OriginalTagCache;

export type WrapperHandler<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> = (
  handler: OpenNextHandler<E, R>,
  converter: Converter<E, R>,
) => Promise<(...args: any[]) => any>;

export type Wrapper<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> = BaseOverride & {
  wrapper: WrapperHandler<E, R>;
  supportStreaming: boolean;
  edgeRuntime?: boolean;
};

export type OpenNextHandlerOptions = {
  // Create a `Writeable` for streaming responses.
  streamCreator?: StreamCreator;
  // Extends the liftetime of the runtime after the response is returned.
  waitUntil?: WaitUntil;
};

export type OpenNextHandler<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> = (event: E, options?: OpenNextHandlerOptions) => Promise<R>;

export type Converter<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> = BaseOverride & {
  convertFrom: (event: any) => Promise<E>;
  convertTo: (result: R, originalRequest?: any) => Promise<any>;
};

export type Warmer = BaseOverride & {
  invoke: (warmerId: string) => Promise<void>;
};

export type ImageLoader = BaseOverride & {
  load: (url: string) => Promise<{
    body?: Readable;
    contentType?: string;
    cacheControl?: string;
  }>;
};

export type OriginResolver = BaseOverride & {
  resolve: (path: string) => Promise<Origin | false>;
};

export type ProxyExternalRequest = BaseOverride & {
  proxy: (event: InternalEvent) => Promise<InternalResult>;
};

type CDNPath = {
  initialPath: string;
  rawPath: string;
  resolvedRoutes: ResolvedRoute[];
};

export type CDNInvalidationHandler = BaseOverride & {
  invalidatePaths: (paths: CDNPath[]) => Promise<void>;
};
