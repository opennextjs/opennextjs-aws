/* eslint-disable sonarjs/no-duplicate-string */
import { NextConfig } from "@opennextjs/aws/adapters/config/index.js";
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
      "/": {
        initialRevalidateSeconds: 120,
        srcRoute: "/",
        dataRoute: "/index.rsc",
      },
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
      "/admin/%ZZ": {
        initialRevalidateSeconds: false,
        srcRoute: "/admin/[slug]",
        dataRoute: "/admin/%ZZ.rsc",
      },
    },
    dynamicRoutes: {
      // A `dynamicParams: true` route. Entries for ids that `generateStaticParams` did
      // not return are absent from `routes` above, they are runtime write-backs.
      "/isr/[id]": {
        routeRegex: "^/isr/([^/]+?)(?:/)?$",
        dataRoute: null,
        fallback: null,
        dataRouteRegex: null,
      },
    },
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
  mode: "original",
  getByTag: vi.fn(),
  getByPath: vi.fn(),
  getLastModified: vi.fn(),
  isStale: vi.fn().mockResolvedValue(false),
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
  var nextVersion: string;
}

globalThis.incrementalCache = incrementalCache;
globalThis.tagCache = tagCache;
globalThis.queue = queue;

beforeEach(() => {
  vi.useFakeTimers().setSystemTime("2024-01-02T00:00:00Z");
  vi.clearAllMocks();
  globalThis.nextVersion = "16.0.0";
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

  it("should not intercept a path containing a malformed escape", async () => {
    const event = createEvent({
      url: "/%61dmin/%ZZ",
    });

    const result = await cacheInterceptor(event);

    expect(result).toEqual(event);
    expect(incrementalCache.get).not.toHaveBeenCalled();
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
    expect(incrementalCache.get).toHaveBeenCalledWith("/albums");
    expect(tagCache.getLastModified).toHaveBeenCalledWith(
      "/albums",
      expect.any(Number),
    );
    expect(tagCache.isStale).toHaveBeenCalledWith(
      "/albums",
      expect.any(Number),
    );
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

  it("should retrieve index app router content from the index cache key", async () => {
    const event = createEvent({
      url: "/",
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "app",
        html: "Index page",
      },
      lastModified: new Date("2024-01-01T23:59:30Z").getTime(),
    });

    const result = await cacheInterceptor(event);

    const body = await fromReadableStream(result.body);
    expect(body).toEqual("Index page");
    expect(incrementalCache.get).toHaveBeenCalledWith("/index");
    expect(tagCache.getLastModified).toHaveBeenCalledWith(
      "/index",
      expect.any(Number),
    );
    expect(tagCache.isStale).toHaveBeenCalledWith("/index", expect.any(Number));
    expect(result).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          "cache-control": "s-maxage=90, stale-while-revalidate=2592000",
          "x-opennext-cache": "HIT",
        }),
      }),
    );
  });

  it("should revalidate stale index content using the route path", async () => {
    const event = createEvent({
      url: "/",
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "app",
        html: "Index page",
      },
      lastModified: new Date("2024-01-01T23:57:00Z").getTime(),
    });

    const result = await cacheInterceptor(event);

    expect(incrementalCache.get).toHaveBeenCalledWith("/index");
    expect(queue.send).toHaveBeenCalledWith(
      expect.objectContaining({
        MessageBody: expect.objectContaining({
          url: "/",
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          "cache-control": "s-maxage=1, stale-while-revalidate=2592000",
          "x-opennext-cache": "STALE",
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

  it("should bypass the tag cache when shouldBypassTagCache is true", async () => {
    const event = createEvent({
      url: "/albums",
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "app",
        html: "Hello, world!",
      },
      shouldBypassTagCache: true,
    });

    await cacheInterceptor(event);

    expect(tagCache.getLastModified).not.toHaveBeenCalled();
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

  it("should return the cached status code over the rewriteStatusCode", async () => {
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
    expect(result.statusCode).toBe(404);
  });

  it("should return the rewriteStatusCode if the cached status code is 200", async () => {
    const event = createEvent({
      url: "/albums",
      rewriteStatusCode: 203,
    });
    incrementalCache.get.mockResolvedValueOnce({
      value: {
        type: "app",
        html: "Hello, world!",
        meta: {
          status: 200,
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

  describe("app RSC output", () => {
    afterEach(() => {
      delete (NextConfig as any).experimental;
    });

    it("should return RSC content for RSC data requests", async () => {
      const event = createEvent({
        url: "/albums",
        headers: { rsc: "1" },
      });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "HTML content",
          rsc: "RSC content",
        },
      });

      const result = await cacheInterceptor(event);

      const body = await fromReadableStream(result.body);
      expect(body).toEqual("RSC content");
      expect(result).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            "content-type": "text/x-component",
          }),
        }),
      );
    });

    it("should return segment data when next-router-segment-prefetch header matches segmentData", async () => {
      const event = createEvent({
        url: "/albums",
        headers: {
          rsc: "1",
          "next-router-segment-prefetch": "/layout",
        },
      });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "HTML content",
          rsc: "RSC content",
          segmentData: { "/layout": "Segment content" },
        },
      });

      const result = await cacheInterceptor(event);

      const body = await fromReadableStream(result.body);
      expect(body).toEqual("Segment content");
      expect(result).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-nextjs-prerender": "1",
            "x-nextjs-postponed": "2",
          }),
        }),
      );
    });

    it("should fall back to RSC when segment key does not exist in segmentData", async () => {
      const event = createEvent({
        url: "/albums",
        headers: {
          rsc: "1",
          "next-router-segment-prefetch": "/not-here",
        },
      });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "HTML content",
          rsc: "RSC content",
          segmentData: { "/layout": "Segment content" },
        },
      });

      const result = await cacheInterceptor(event);

      const body = await fromReadableStream(result.body);
      expect(body).toEqual("RSC content");
      expect((result as any).headers["x-nextjs-prerender"]).toBeUndefined();
      expect((result as any).headers["x-nextjs-postponed"]).toBeUndefined();
    });

    it("should fall back to RSC when prefetchInlining is enabled", async () => {
      const event = createEvent({
        url: "/albums",
        headers: {
          rsc: "1",
          "next-router-segment-prefetch": "/layout",
        },
      });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "HTML content",
          rsc: "RSC content",
          segmentData: { "/layout": "Segment content" },
        },
      });
      (NextConfig as any).experimental = { prefetchInlining: true };

      const result = await cacheInterceptor(event);

      const body = await fromReadableStream(result.body);
      expect(body).toEqual("RSC content");
      expect((result as any).headers["x-nextjs-prerender"]).toBeUndefined();
      expect((result as any).headers["x-nextjs-postponed"]).toBeUndefined();
    });

    // `rsc` is absent from the cached value when the build collected neither a
    // `.rsc` nor a `.prefetch.rsc` file for the entry. Note that a postponed PPR
    // route is not one of those cases: Next.js skips its `.rsc` but does write a
    // `.prefetch.rsc`, which `createAssets` stores in the same field.
    describe("missing rsc", () => {
      it("should serve segment data when rsc is missing and the segment key matches", async () => {
        const event = createEvent({
          url: "/albums",
          headers: {
            rsc: "1",
            "next-router-segment-prefetch": "/layout",
          },
        });
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "app",
            html: "HTML content",
            segmentData: { "/layout": "Segment content" },
          },
        });

        const result = await cacheInterceptor(event);

        const body = await fromReadableStream(result.body);
        expect(body).toEqual("Segment content");
        expect((result as any).headers["x-nextjs-prerender"]).toEqual("1");
        expect((result as any).headers["x-nextjs-postponed"]).toEqual("2");
      });

      it("should serve the HTML when rsc is missing on a non-RSC request", async () => {
        const event = createEvent({ url: "/albums" });
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "app",
            html: "HTML content",
          },
        });

        const result = await cacheInterceptor(event);

        const body = await fromReadableStream(result.body);
        expect(body).toEqual("HTML content");
        expect((result as any).headers["content-type"]).toEqual(
          "text/html; charset=utf-8",
        );
      });

      it("should take no action for an RSC request when rsc is missing", async () => {
        const event = createEvent({
          url: "/albums",
          headers: { rsc: "1" },
        });
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "app",
            html: "HTML content",
          },
        });

        const result = await cacheInterceptor(event);

        expect(result).toEqual(event);
      });

      it("should take no action for an RSC request when rsc is missing and the segment key does not match", async () => {
        const event = createEvent({
          url: "/albums",
          headers: {
            rsc: "1",
            "next-router-segment-prefetch": "/not-here",
          },
        });
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "app",
            html: "HTML content",
            segmentData: { "/layout": "Segment content" },
          },
        });

        const result = await cacheInterceptor(event);

        expect(result).toEqual(event);
      });

      it("should take no action for an RSC request when rsc is missing and prefetchInlining is enabled", async () => {
        const event = createEvent({
          url: "/albums",
          headers: {
            rsc: "1",
            "next-router-segment-prefetch": "/layout",
          },
        });
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "app",
            html: "HTML content",
            segmentData: { "/layout": "Segment content" },
          },
        });
        (NextConfig as any).experimental = { prefetchInlining: true };

        const result = await cacheInterceptor(event);

        expect(result).toEqual(event);
      });

      it("should not queue a revalidation when falling back to the server", async () => {
        const event = createEvent({
          url: "/revalidate",
          headers: { rsc: "1" },
        });
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "app",
            html: "HTML content",
          },
          lastModified: new Date("2024-01-01T00:00:00Z").getTime(),
        });

        const result = await cacheInterceptor(event);

        expect(result).toEqual(event);
        expect(queue.send).not.toHaveBeenCalled();
      });
    });

    // `html` is absent from the cached value when Next.js does not write the
    // `.html` file at build time.
    describe("missing html", () => {
      it("should serve the RSC payload when html is missing on an RSC request", async () => {
        const event = createEvent({
          url: "/albums",
          headers: { rsc: "1" },
        });
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "app",
            rsc: "RSC content",
          },
        });

        const result = await cacheInterceptor(event);

        const body = await fromReadableStream(result.body);
        expect(body).toEqual("RSC content");
      });

      it("should take no action for a document request when html is missing", async () => {
        const event = createEvent({ url: "/albums" });
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "app",
            rsc: "RSC content",
          },
        });

        const result = await cacheInterceptor(event);

        expect(result).toEqual(event);
      });

      it("should take no action for a page document request when html is missing", async () => {
        const event = createEvent({ url: "/revalidate" });
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "page",
            json: { hello: "world" },
          },
        });

        const result = await cacheInterceptor(event);

        expect(result).toEqual(event);
      });

      it("should serve the json for a page data request when html is missing", async () => {
        const event = createEvent({ url: "/revalidate?__nextDataReq=1" });
        incrementalCache.get.mockResolvedValueOnce({
          value: {
            type: "page",
            json: { hello: "world" },
          },
        });

        const result = await cacheInterceptor(event);

        const body = await fromReadableStream(result.body);
        expect(body).toEqual('{"hello":"world"}');
      });
    });
  });

  describe("isStale", () => {
    it("should serve stale app content when isStale returns true", async () => {
      const event = createEvent({ url: "/albums" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "Hello, world!",
        },
        lastModified: new Date("2024-01-02T00:00:00Z").getTime(),
      });
      tagCache.isStale.mockResolvedValueOnce(true);

      const result = await cacheInterceptor(event);

      const body = await fromReadableStream(result.body);
      expect(body).toEqual("Hello, world!");
      expect(result).toEqual(
        expect.objectContaining({
          type: "core",
          headers: expect.objectContaining({
            "cache-control": "s-maxage=1, stale-while-revalidate=2592000",
            "x-opennext-cache": "STALE",
          }),
        }),
      );
      expect(queue.send).toHaveBeenCalled();
    });

    it("should serve stale route content when isStale returns true", async () => {
      const event = createEvent({ url: "/albums" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "route",
          body: "API response",
          meta: {
            status: 200,
            headers: { "content-type": "application/json" },
          },
          revalidate: 300,
        },
        lastModified: new Date("2024-01-02T00:00:00Z").getTime(),
      });
      tagCache.isStale.mockResolvedValueOnce(true);

      const result = await cacheInterceptor(event);

      expect(result).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            "cache-control": "s-maxage=1, stale-while-revalidate=2592000",
            "x-opennext-cache": "STALE",
          }),
        }),
      );
      expect(queue.send).toHaveBeenCalled();
    });

    it("should not check isStale when shouldBypassTagCache is true", async () => {
      const event = createEvent({ url: "/albums" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "Hello, world!",
        },
        lastModified: new Date("2024-01-02T00:00:00Z").getTime(),
        shouldBypassTagCache: true,
      });

      await cacheInterceptor(event);

      expect(tagCache.isStale).not.toHaveBeenCalled();
    });

    it("should not call isStale when nextVersion is below 16", async () => {
      globalThis.nextVersion = "15.0.0";
      const event = createEvent({ url: "/albums" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "Hello, world!",
        },
        lastModified: new Date("2024-01-02T00:00:00Z").getTime(),
      });

      await cacheInterceptor(event);

      expect(tagCache.isStale).not.toHaveBeenCalled();
    });

    it("should serve fresh content when isStale returns false", async () => {
      const event = createEvent({ url: "/albums" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "Hello, world!",
        },
        lastModified: new Date("2024-01-02T00:00:00Z").getTime(),
      });
      tagCache.isStale.mockResolvedValueOnce(false);

      const result = await cacheInterceptor(event);

      expect(result).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            "cache-control":
              "s-maxage=31536000, stale-while-revalidate=2592000",
            "x-opennext-cache": "HIT",
          }),
        }),
      );
      expect(queue.send).not.toHaveBeenCalled();
    });
  });

  // Next.js writes `notFound()` results and other error responses to the incremental
  // cache, so the interceptor can serve them. It must not let the CDN keep them:
  // `OpenNextNodeResponse.fixHeadersForError` does this on the server path, and the
  // interceptor bypasses it by returning a result directly.
  describe("error status codes", () => {
    const NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate";

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("should not cache a 404 app router response", async () => {
      const event = createEvent({ url: "/albums" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "<html>404</html>",
          meta: { status: 404 },
        },
      });

      const result = await cacheInterceptor(event);

      // The body and the status are still served from the cache, only the
      // cache-control changes.
      expect(await fromReadableStream(result.body)).toEqual("<html>404</html>");
      expect(result).toEqual(
        expect.objectContaining({
          statusCode: 404,
          headers: expect.objectContaining({
            "cache-control": NO_STORE,
            "content-type": "text/html; charset=utf-8",
          }),
        }),
      );
    });

    it("should not cache a 500 app router response", async () => {
      const event = createEvent({ url: "/albums" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "<html>500</html>",
          meta: { status: 500 },
        },
      });

      const result = await cacheInterceptor(event);

      expect(result.statusCode).toBe(500);
      expect(result.headers["cache-control"]).toBe(NO_STORE);
    });

    // The reported case: `notFound()` on a `dynamicParams: true` route. The entry is a
    // runtime write-back so it is absent from the prerender manifest, and the route
    // declares no `revalidate`, which used to make it look like SSG and earn a
    // `s-maxage=31536000`.
    it("should not cache a 404 for a dynamic route absent from the prerender manifest", async () => {
      const event = createEvent({ url: "/isr/21" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "<html>404</html>",
          meta: { status: 404 },
        },
        lastModified: new Date("2024-01-02T00:00:00Z").getTime(),
      });

      const result = await cacheInterceptor(event);

      expect(incrementalCache.get).toHaveBeenCalledWith("/isr/21");
      expect(result.statusCode).toBe(404);
      expect(result.headers["cache-control"]).toBe(NO_STORE);
    });

    it("should not cache a 404 page router response", async () => {
      const event = createEvent({ url: "/revalidate" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "page",
          html: "<html>404</html>",
          revalidate: 60,
          meta: { status: 404 },
        },
        lastModified: new Date("2024-01-02T00:00:00Z").getTime(),
      });

      const result = await cacheInterceptor(event);

      expect(result.statusCode).toBe(404);
      expect(result.headers["cache-control"]).toBe(NO_STORE);
    });

    it("should not cache a 404 route handler response", async () => {
      const event = createEvent({ url: "/albums" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "route",
          body: '{"error":"not found"}',
          meta: {
            status: 404,
            headers: { "content-type": "application/json" },
          },
          revalidate: false,
        },
        lastModified: new Date("2024-01-02T00:00:00Z").getTime(),
      });

      const result = await cacheInterceptor(event);

      expect(await fromReadableStream(result.body)).toEqual(
        '{"error":"not found"}',
      );
      expect(result).toEqual(
        expect.objectContaining({
          statusCode: 404,
          headers: expect.objectContaining({
            "cache-control": NO_STORE,
            "content-type": "application/json",
          }),
        }),
      );
    });

    // The entry's own headers are spread after the computed cache control, so the
    // override has to be applied last to win over both.
    it("should override a cache-control stored in the entry headers", async () => {
      const event = createEvent({ url: "/albums" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "<html>404</html>",
          meta: {
            status: 404,
            headers: { "cache-control": "s-maxage=31536000" },
          },
        },
      });

      const result = await cacheInterceptor(event);

      expect(result.headers["cache-control"]).toBe(NO_STORE);
    });

    it("should not cache when the error status comes from rewriteStatusCode", async () => {
      const event = createEvent({ url: "/albums", rewriteStatusCode: 404 });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "Hello, world!",
        },
      });

      const result = await cacheInterceptor(event);

      expect(result.statusCode).toBe(404);
      expect(result.headers["cache-control"]).toBe(NO_STORE);
    });

    // A stale error entry must still be queued for revalidation, otherwise the 404
    // stays in the incremental cache instead of merely being uncacheable at the CDN.
    it("should still queue a revalidation for a stale 404", async () => {
      const event = createEvent({ url: "/revalidate" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "<html>404</html>",
          revalidate: 60,
          meta: { status: 404 },
        },
        lastModified: new Date("2024-01-01T23:58:00Z").getTime(),
      });

      const result = await cacheInterceptor(event);

      expect(queue.send).toHaveBeenCalled();
      expect(result.headers["cache-control"]).toBe(NO_STORE);
      expect(result.headers["x-opennext-cache"]).toBe("STALE");
    });

    // Only 404 and 500 are overridden, the rest are the application's own errors and
    // it owns their cache headers.
    it("should leave other error status codes cacheable", async () => {
      const event = createEvent({ url: "/albums" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "Gone",
          meta: { status: 410 },
        },
      });

      const result = await cacheInterceptor(event);

      expect(result.statusCode).toBe(410);
      expect(result.headers["cache-control"]).toBe(
        "s-maxage=31536000, stale-while-revalidate=2592000",
      );
    });

    it("should leave a 200 untouched", async () => {
      const event = createEvent({ url: "/albums" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "Hello, world!",
        },
      });

      const result = await cacheInterceptor(event);

      expect(result.headers["cache-control"]).toBe(
        "s-maxage=31536000, stale-while-revalidate=2592000",
      );
    });

    it("should keep the cached headers when OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS is true", async () => {
      vi.stubEnv("OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS", "true");
      const event = createEvent({ url: "/albums" });
      incrementalCache.get.mockResolvedValueOnce({
        value: {
          type: "app",
          html: "<html>404</html>",
          meta: { status: 404 },
        },
      });

      const result = await cacheInterceptor(event);

      expect(result.statusCode).toBe(404);
      expect(result.headers["cache-control"]).toBe(
        "s-maxage=31536000, stale-while-revalidate=2592000",
      );
    });
  });
});
