/* eslint-disable sonarjs/no-duplicate-string */
import { cacheInterceptor } from "@opennextjs/aws/core/routing/cacheInterceptor.js";
import { convertFromQueryString } from "@opennextjs/aws/core/routing/util.js";
import { Queue } from "@opennextjs/aws/queue/types.js";
import { InternalEvent } from "@opennextjs/aws/types/open-next.js";
import { fromReadableStream } from "@opennextjs/aws/utils/stream.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {},
  PrerenderManifest: {
    routes: {
      "/albums": {
        initialRevalidateSeconds: false,
        srcRoute: "/albums",
        dataRoute: "/albums.rsc",
      },
      "/revalidate": {
        initialRevalidateSeconds: 60,
        srcRoute: null,
        dataRoute: "/_next/data/abc/revalidate.json",
      },
    },
    dynamicRoutes: {},
  },
}));

vi.mock("@opennextjs/aws/core/routing/i18n/index.js", () => ({
  localizePath: (event: InternalEvent) => event.rawPath,
}));

type PartialEvent = Partial<
  Omit<InternalEvent, "body" | "rawPath" | "query">
> & { body?: string };

function createEvent(event: PartialEvent): InternalEvent {
  const [rawPath, qs] = (event.url ?? "/").split("?", 2);
  return {
    type: "core",
    method: event.method ?? "GET",
    rawPath,
    url: event.url ?? "/",
    body: Buffer.from(event.body ?? ""),
    headers: event.headers ?? {},
    query: convertFromQueryString(qs ?? ""),
    cookies: event.cookies ?? {},
    remoteAddress: event.remoteAddress ?? "::1",
  };
}

const incrementalCache = {
  name: "mock",
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

const tagCache = {
  name: "mock",
  getByTag: vi.fn(),
  getByPath: vi.fn(),
  getLastModified: vi.fn(),
  writeTags: vi.fn(),
};

const queue = {
  name: "mock",
  send: vi.fn(),
};

globalThis.incrementalCache = incrementalCache;
globalThis.tagCache = tagCache;

declare global {
  var queue: Queue;
}
globalThis.queue = queue;

beforeEach(() => {
  vi.useFakeTimers().setSystemTime("2024-01-02T00:00:00Z");
  vi.clearAllMocks();
});

describe("cacheInterceptor", () => {
  it("should take no action when next-action header is present", async () => {
    const event = createEvent({
      headers: {
        "next-action": "something",
      },
    });
    const result = await cacheInterceptor(event);

    expect(result).toEqual(event);
  });

  it("should take no action when x-prerender-revalidate header is present", async () => {
    const event = createEvent({
      headers: {
        "x-prerender-revalidate": "1",
      },
    });
    const result = await cacheInterceptor(event);

    expect(result).toEqual(event);
  });

  it("should take no action when incremental cache throws", async () => {
    const event = createEvent({
      url: "/albums",
    });

    incrementalCache.get.mockRejectedValueOnce(new Error("mock error"));
    const result = await cacheInterceptor(event);

    expect(result).toEqual(event);
  });

  it("should retrieve app router content from cache", async () => {
    const event = createEvent({
      url: "/albums",
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "app",
        html: "Hello, world!",
      },
    });

    const result = await cacheInterceptor(event);

    const body = await fromReadableStream(result.body);
    expect(body).toEqual("Hello, world!");
    expect(result).toEqual(
      expect.objectContaining({
        type: "core",
        statusCode: 200,
        isBase64Encoded: false,
        headers: expect.objectContaining({
          "cache-control": "s-maxage=31536000, stale-while-revalidate=2592000",
          "content-type": "text/html; charset=utf-8",
          etag: expect.any(String),
          "x-opennext-cache": "HIT",
        }),
      }),
    );
  });

  it("should take no action when tagCache lasModified is -1", async () => {
    const event = createEvent({
      url: "/albums",
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "app",
        html: "Hello, world!",
      },
    });
    tagCache.getLastModified.mockResolvedValueOnce(-1);

    const result = await cacheInterceptor(event);

    expect(result).toEqual(event);
  });

  it("should retrieve page router content from stale cache", async () => {
    const event = createEvent({
      url: "/revalidate",
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "page",
        html: "Hello, world!",
        revalidate: 60,
      },
      lastModified: new Date("2024-01-01T23:58:00Z").getTime(),
    });

    const result = await cacheInterceptor(event);

    const body = await fromReadableStream(result.body);
    expect(body).toEqual("Hello, world!");
    expect(result).toEqual(
      expect.objectContaining({
        type: "core",
        statusCode: 200,
        isBase64Encoded: false,
        headers: expect.objectContaining({
          "cache-control": "s-maxage=1, stale-while-revalidate=2592000",
          "content-type": "text/html; charset=utf-8",
          etag: expect.any(String),
          "x-opennext-cache": "STALE",
        }),
      }),
    );
  });

  it("should retrieve page router content from active cache", async () => {
    const event = createEvent({
      url: "/revalidate",
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "page",
        html: "Hello, world!",
        revalidate: 60,
      },
      lastModified: new Date("2024-01-02T00:00:00Z").getTime(),
    });

    const result = await cacheInterceptor(event);

    const body = await fromReadableStream(result.body);
    expect(body).toEqual("Hello, world!");
    expect(result).toEqual(
      expect.objectContaining({
        type: "core",
        statusCode: 200,
        isBase64Encoded: false,
        headers: expect.objectContaining({
          "cache-control": "s-maxage=60, stale-while-revalidate=2592000",
          "content-type": "text/html; charset=utf-8",
          etag: expect.any(String),
          "x-opennext-cache": "HIT",
        }),
      }),
    );
  });

  it("should retrieve redirect content from cache", async () => {
    const event = createEvent({
      url: "/albums",
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "redirect",
        meta: {
          status: 302,
        },
      },
    });

    const result = await cacheInterceptor(event);

    expect(result).toEqual(
      expect.objectContaining({
        type: "core",
        statusCode: 302,
        isBase64Encoded: false,
        headers: expect.objectContaining({
          "cache-control": "s-maxage=31536000, stale-while-revalidate=2592000",
          etag: expect.any(String),
          "x-opennext-cache": "HIT",
        }),
      }),
    );
  });

  it("should take no action when cache returns unrecoginsed type", async () => {
    const event = createEvent({
      url: "/albums",
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "?",
        html: "Hello, world!",
      },
    });

    const result = await cacheInterceptor(event);

    expect(result).toEqual(event);
  });
});
