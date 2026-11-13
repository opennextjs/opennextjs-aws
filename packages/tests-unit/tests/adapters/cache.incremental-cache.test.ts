/**
 * Runs the cache adapter inside the actual Next.js `IncrementalCache`, to check how Next.js
 * interprets the entries the adapter returns.
 */
import Cache from "@opennextjs/aws/adapters/cache.js";
import { IncrementalCache } from "next/dist/server/lib/incremental-cache/index.js";
import { SharedCacheControls } from "next/dist/server/lib/incremental-cache/shared-cache-controls.external.js";
import { vi } from "vitest";

const SOURCE_ROUTE = "/static/[slug]";
const ROUTE = {
  kind: "APP_PAGE",
  sourceRoute: `${SOURCE_ROUTE}/page`,
} as const;

const incrementalCache = {
  name: "mock",
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
const tagCache = {
  name: "mock",
  mode: "nextMode",
  getLastRevalidated: vi.fn().mockResolvedValue(0),
  hasBeenRevalidated: vi.fn().mockResolvedValue(false),
  isStale: vi.fn(),
  writeTags: vi.fn(),
};

/**
 * Creates the Next.js incremental cache, with the adapter as its cache handler.
 *
 * @param prerendered The prerender manifest entry of `/static/a`, if prerendered
 * @returns The Next.js incremental cache
 */
function createNextIncrementalCache(prerendered?: {
  initialRevalidateSeconds: number | false;
  initialExpireSeconds?: number;
}) {
  return new IncrementalCache({
    minimalMode: true,
    requestHeaders: {},
    allowedRevalidateHeaderKeys: [],
    fetchCacheKeyPrefix: "",
    CurCacheHandler: Cache,
    previewProps: {
      previewModeId: "preview-id",
      previewModeSigningKey: "",
      previewModeEncryptionKey: "",
    },
    prerenderManifest: {
      version: 4,
      routes: prerendered
        ? {
            "/static/a": {
              ...prerendered,
              srcRoute: SOURCE_ROUTE,
              dataRoute: "/static/a.rsc",
              allowHeader: [],
            },
          }
        : {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: {
        previewModeId: "",
        previewModeSigningKey: "",
        previewModeEncryptionKey: "",
      },
    },
  } as unknown as ConstructorParameters<typeof IncrementalCache>[0]);
}

/**
 * Reads `/static/a` through the Next.js incremental cache.
 *
 * @param nextCache The Next.js incremental cache
 * @param stored The lifetime stored with the entry
 * @returns The entry as Next.js serves it
 */
async function getPage(
  nextCache: IncrementalCache,
  stored: { revalidate?: number | false; expire?: number },
) {
  incrementalCache.get.mockResolvedValueOnce({
    value: {
      type: "app",
      html: "<html></html>",
      rsc: "rsc",
      meta: { status: 200, headers: { "x-next-cache-tags": "_N_T_/static/a" } },
      ...stored,
    },
    lastModified: Date.now() - 10_000,
  });
  return nextCache.get("/static/a", {
    kind: "APP_PAGE",
    isRoutePPREnabled: false,
    isFallback: false,
    route: ROUTE,
  } as unknown as Parameters<IncrementalCache["get"]>[1]);
}

describe("Cache adapter in the Next.js incremental cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.nextVersion = "16.4.1";
    globalThis.openNextConfig = {
      dangerous: {},
    } as typeof globalThis.openNextConfig;
    globalThis.incrementalCache =
      incrementalCache as unknown as typeof globalThis.incrementalCache;
    globalThis.tagCache = tagCache as unknown as typeof globalThis.tagCache;
    globalThis.__openNextAls = {
      getStore: vi.fn(),
    } as unknown as typeof globalThis.__openNextAls;
    (
      SharedCacheControls as unknown as { cacheControls: Map<string, unknown> }
    ).cacheControls.clear();
  });

  // `isStale`: `undefined` is a hit, `true` serves the entry stale and revalidates it in the
  // background, `-1` revalidates it in the foreground.
  describe.each([
    {
      page: "a prerendered page with revalidate = false",
      prerendered: { initialRevalidateSeconds: false as const },
      stored: {},
      rendered: { revalidate: false as const },
    },
    {
      page: "a prerendered page with revalidate = 120",
      prerendered: {
        initialRevalidateSeconds: 120,
        initialExpireSeconds: 31_536_000,
      },
      stored: {},
      rendered: { revalidate: 120, expire: 31_536_000 },
    },
    {
      page: "a page with revalidate = false rendered at runtime",
      prerendered: undefined,
      stored: { revalidate: false as const },
      rendered: { revalidate: false as const },
    },
    {
      page: "a page with revalidate = 120 rendered at runtime",
      prerendered: undefined,
      stored: { revalidate: 120, expire: 31_536_000 },
      rendered: { revalidate: 120, expire: 31_536_000 },
    },
  ])("$page", ({ prerendered, stored, rendered }) => {
    it("Should be a hit", async () => {
      tagCache.isStale.mockResolvedValue(false);

      const entry = await getPage(
        createNextIncrementalCache(prerendered),
        stored,
      );

      expect(entry?.isStale).toBeUndefined();
    });

    it("Should be served stale when a tag is stale", async () => {
      tagCache.isStale.mockResolvedValue(true);

      const entry = await getPage(
        createNextIncrementalCache(prerendered),
        stored,
      );

      expect(entry?.isStale).toBe(true);
    });

    it("Should be served stale when a tag is stale, after the page was rendered", async () => {
      const nextCache = createNextIncrementalCache(prerendered);
      // Next.js records the lifetime of the pages it renders.
      await nextCache.set("/static/a", null, {
        cacheControl: rendered,
        route: ROUTE,
      } as unknown as Parameters<IncrementalCache["set"]>[2]);
      tagCache.isStale.mockResolvedValue(true);

      const entry = await getPage(nextCache, stored);

      expect(entry?.isStale).toBe(true);
    });
  });
});
