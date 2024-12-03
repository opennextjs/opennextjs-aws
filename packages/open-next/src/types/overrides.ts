import type { Readable } from "node:stream";

import type { Meta } from "types/cache";

import type {
  BaseEventOrResult,
  BaseOverride,
  InternalEvent,
  InternalResult,
  Origin,
  StreamCreator,
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

export type S3CachedFile =
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

export type S3FetchCache = Object;

export type WithLastModified<T> = {
  lastModified?: number;
  value?: T;
};

export type CacheValue<IsFetch extends boolean> = (IsFetch extends true
  ? S3FetchCache
  : S3CachedFile) & { revalidate?: number | false };

export type IncrementalCache = {
  get<IsFetch extends boolean = false>(
    key: string,
    isFetch?: IsFetch,
  ): Promise<WithLastModified<CacheValue<IsFetch>>>;
  set<IsFetch extends boolean = false>(
    key: string,
    value: CacheValue<IsFetch>,
    isFetch?: IsFetch,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  name: string;
};

// Tag cache

export type TagCache = {
  getByTag(tag: string): Promise<string[]>;
  getByPath(path: string): Promise<string[]>;
  getLastModified(path: string, lastModified?: number): Promise<number>;
  writeTags(
    tags: { tag: string; path: string; revalidatedAt?: number }[],
  ): Promise<void>;
  name: string;
};

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

export type OpenNextHandler<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> = (event: E, responseStream?: StreamCreator) => Promise<R>;

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
