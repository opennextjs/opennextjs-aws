/* eslint-disable sonarjs/no-duplicate-string */
import { cacheInterceptor } from "@opennextjs/aws/core/routing/cacheInterceptor.js";
import { convertFromQueryString } from "@opennextjs/aws/core/routing/util.js";
import type { MiddlewareEvent } from "@opennextjs/aws/types/open-next.js";
import type { Queue } from "@opennextjs/aws/types/overrides.js";
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
  localizePath: (event: MiddlewareEvent) => event.rawPath,
}));

type PartialEvent = Partial<
  Omit<MiddlewareEvent, "body" | "rawPath" | "query">
> & { body?: string };

function createEvent(event: PartialEvent): MiddlewareEvent {
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
    rewriteStatusCode: event.rewriteStatusCode,
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

declare global {
  var queue: Queue;
  var incrementalCache: any;
  var tagCache: any;
}

globalThis.incrementalCache = incrementalCache;
globalThis.tagCache = tagCache;
globalThis.queue = queue;

beforeEach(() => {
  vi.useFakeTimers().setSystemTime("2024-01-02T00:00:00Z");
  vi.clearAllMocks();
  globalThis.openNextConfig = {
    dangerous: {
      disableTagCache: false,
      disableIncrementalCache: false,
    },
  };
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

  it("should take no action when tagCache lasModified is -1 for app type", async () => {
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

  it("should take no action when tagCache lasModified is -1 for route type", async () => {
    const event = createEvent({
      url: "/albums",
    });

    const body = "route";
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "route",
        body: body,
        revalidate: false,
      },
      lastModified: new Date("2024-01-01T23:58:00Z").getTime(),
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

  it("should take no action when cache returns unrecognized type", async () => {
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

  it("should retrieve route content from cache with text content", async () => {
    const event = createEvent({
      url: "/albums",
    });
    const routeBody = JSON.stringify({ message: "Hello from API" });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "route",
        body: routeBody,
        meta: {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
        revalidate: 300,
      },
      lastModified: new Date("2024-01-02T00:00:00Z").getTime(),
    });

    const result = await cacheInterceptor(event);

    const body = await fromReadableStream(result.body);
    expect(body).toEqual(routeBody);
    expect(result).toEqual(
      expect.objectContaining({
        type: "core",
        statusCode: 200,
        isBase64Encoded: false,
        headers: expect.objectContaining({
          "cache-control": "s-maxage=300, stale-while-revalidate=2592000",
          "content-type": "application/json",
          etag: expect.any(String),
          "x-opennext-cache": "HIT",
          vary: "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url",
        }),
      }),
    );
  });

  it("should retrieve route content from cache with binary content", async () => {
    const event = createEvent({
      url: "/albums",
    });
    const routeBody = "randomBinaryData";
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "route",
        body: routeBody,
        meta: {
          status: 200,
          headers: {
            "content-type": "image/png",
          },
        },
        revalidate: false,
      },
      lastModified: new Date("2024-01-02T00:00:00Z").getTime(),
    });

    const result = await cacheInterceptor(event);

    const body = await fromReadableStream(result.body, true);
    expect(body).toEqual(routeBody);
    expect(result).toEqual(
      expect.objectContaining({
        type: "core",
        statusCode: 200,
        isBase64Encoded: true,
        headers: expect.objectContaining({
          "cache-control": "s-maxage=31536000, stale-while-revalidate=2592000",
          "content-type": "image/png",
          etag: expect.any(String),
          "x-opennext-cache": "HIT",
          vary: "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url",
        }),
      }),
    );
  });

  it("should retrieve route content from stale cache", async () => {
    const event = createEvent({
      url: "/albums",
    });
    const routeBody = "API response";
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "route",
        body: routeBody,
        meta: {
          status: 201,
          headers: {
            "content-type": "text/plain",
            "custom-header": "custom-value",
          },
        },
        revalidate: 60,
      },
      lastModified: new Date("2024-01-01T23:58:00Z").getTime(),
    });

    const result = await cacheInterceptor(event);

    const body = await fromReadableStream(result.body);
    expect(body).toEqual(routeBody);
    expect(result).toEqual(
      expect.objectContaining({
        type: "core",
        statusCode: 201,
        isBase64Encoded: false,
        headers: expect.objectContaining({
          "cache-control": "s-maxage=1, stale-while-revalidate=2592000",
          "content-type": "text/plain",
          "custom-header": "custom-value",
          etag: expect.any(String),
          "x-opennext-cache": "STALE",
          vary: "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url",
        }),
      }),
    );
  });

  it("should retrieve route content with default status code when meta is missing", async () => {
    const event = createEvent({
      url: "/albums",
    });
    const routeBody = "Simple response";
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "route",
        body: routeBody,
        revalidate: false,
      },
      lastModified: new Date("2024-01-02T00:00:00Z").getTime(),
    });

    const result = await cacheInterceptor(event);

    const body = await fromReadableStream(result.body);
    expect(body).toEqual(routeBody);
    expect(result).toEqual(
      expect.objectContaining({
        type: "core",
        statusCode: 200,
        isBase64Encoded: false,
        headers: expect.objectContaining({
          "cache-control": "s-maxage=31536000, stale-while-revalidate=2592000",
          etag: expect.any(String),
          "x-opennext-cache": "HIT",
          vary: "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url",
        }),
      }),
    );
  });

  it("should return the rewrite status code when there is active cache", async () => {
    const event = createEvent({
      url: "/albums",
      rewriteStatusCode: 403,
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "app",
        html: "Hello, world!",
      },
    });

    const result = await cacheInterceptor(event);
    expect(result.statusCode).toBe(403);
  });

  it("should return the rewriteStatusCode if there is a cached status code", async () => {
    const event = createEvent({
      url: "/albums",
      rewriteStatusCode: 203,
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "app",
        html: "Hello, world!",
        meta: {
          status: 404,
        },
      },
    });

    const result = await cacheInterceptor(event);
    expect(result.statusCode).toBe(203);
  });

  it("should return the cached status code if there is one", async () => {
    const event = createEvent({
      url: "/albums",
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "app",
        html: "Hello, world!",
        meta: {
          status: 405,
        },
      },
    });

    const result = await cacheInterceptor(event);
    expect(result.statusCode).toBe(405);
  });

  it("should return 200 if there is no cached status code, nor a rewriteStatusCode", async () => {
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
    expect(result.statusCode).toBe(200);
  });
});
