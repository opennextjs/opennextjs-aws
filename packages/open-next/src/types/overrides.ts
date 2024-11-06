import type { Meta } from "types/cache";

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
