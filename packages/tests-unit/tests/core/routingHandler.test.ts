import routingHandler from "@opennextjs/aws/core/routingHandler.js";
import type {
  InternalEvent,
  InternalResult,
  RoutingResult,
} from "@opennextjs/aws/types/open-next.js";
import { vi } from "vitest";

const { handleMiddleware, cacheInterceptor, configHeaders, redirects } =
  vi.hoisted(() => ({
    handleMiddleware: vi.fn(),
    cacheInterceptor: vi.fn(),
    configHeaders: [] as unknown[],
    redirects: [] as unknown[],
  }));

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  BuildId: "build-id",
  ConfigHeaders: configHeaders,
  NextConfig: {},
  PrerenderManifest: { routes: {}, dynamicRoutes: {} },
  AppPathRoutesManifest: {
    "/catalog/[group]/[category]/[item]/page":
      "/catalog/[group]/[category]/[item]",
    "/[...slug]/page": "/[...slug]",
  },
  PagesManifest: {},
  RoutesManifest: {
    basePath: "",
    locales: [],
    redirects,
    rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
    routes: {
      static: [],
      dynamic: [
        {
          page: "/catalog/[group]/[category]/[item]",
          regex: "^/catalog/([^/]+?)/([^/]+?)/([^/]+?)(?:/)?$",
        },
        { page: "/[...slug]", regex: "^/(.+?)(?:/)?$" },
      ],
    },
  },
}));

vi.mock("@opennextjs/aws/core/routing/middleware.js", () => ({
  handleMiddleware,
}));

vi.mock("@opennextjs/aws/core/routing/cacheInterceptor.js", () => ({
  cacheInterceptor,
}));

/**
 * Creates an internal event for a path.
 *
 * @param rawPath The rawPath of the event
 * @param url The URL of the event, defaults to the rawPath on `https://on`
 * @returns The event
 */
function createEvent(rawPath: string, url = `https://on${rawPath}`) {
  return {
    type: "core",
    method: "GET",
    rawPath,
    url,
    headers: {},
    query: {},
    cookies: {},
    remoteAddress: "::1",
  } satisfies InternalEvent;
}

describe("routingHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleMiddleware.mockImplementation(async (event: InternalEvent) => event);
    cacheInterceptor.mockImplementation(async (event: InternalEvent) => event);
    vi.stubGlobal("openNextConfig", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes a request with concrete params", async () => {
    const result = (await routingHandler(
      createEvent("/catalog/new/alpha/a"),
      {},
    )) as RoutingResult;

    expect(result.internalEvent.rawPath).toBe("/catalog/new/alpha/a");
    expect(result.resolvedRoutes).toEqual([
      { route: "/catalog/[group]/[category]/[item]", type: "app" },
      { route: "/[...slug]", type: "app" },
    ]);
  });

  it.each([
    "/catalog/new/missing/%5Bitem%5D",
    "/catalog/new/missing/[item]",
    "/catalog/new/%5Bcategory%5D/a",
    "/%5B...slug%5D",
  ])(
    "routes a request with a dynamic segment placeholder value to the 404 page: %s",
    async (rawPath) => {
      const result = (await routingHandler(
        createEvent(rawPath),
        {},
      )) as RoutingResult;

      expect(result.internalEvent.rawPath).toBe("/404");
      expect(result.internalEvent.url).toBe("https://on/404");
      expect(
        result.internalEvent.headers["x-middleware-response-cache-control"],
      ).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
      expect(result.resolvedRoutes).toEqual([]);
      expect(result.isExternalRewrite).toBe(false);
    },
  );

  it("checks the normalized URL pathname", async () => {
    // The pathname is normalized to `/catalog/new/missing/[item]/`, which is redirected like Next.js does.
    // The redirect target is routed to the 404 page (see above).
    const result = (await routingHandler(
      createEvent("/catalog/new/missing/[item]/%2e"),
      {},
    )) as InternalResult;

    expect(result.statusCode).toBe(308);
    expect(result.headers.Location).toBe("/catalog/new/missing/[item]");
  });

  it.each([
    ["/foo/../catalog/new/alpha/a", "/catalog/new/alpha/a"],
    ["/foo/%2e%2e/catalog/new/alpha/a", "/catalog/new/alpha/a"],
    ["/foo/%2E%2E/catalog/new/alpha/a", "/catalog/new/alpha/a"],
    ["/foo/.%2e/catalog/new/alpha/a", "/catalog/new/alpha/a"],
    ["/./catalog/new/alpha/a", "/catalog/new/alpha/a"],
    ["/%2e/catalog/new/alpha/a", "/catalog/new/alpha/a"],
    // A prefix excluded by a negative lookahead matcher (i.e. `/((?!api|_next/static).*)`)
    ["/api/%2e%2e/admin", "/admin"],
    // The URL parser handles a backslash as a slash and removes tabs and new lines
    ["/foo\\..\\catalog/new/alpha/a", "/catalog/new/alpha/a"],
    ["/foo/.\t./catalog/new/alpha/a", "/catalog/new/alpha/a"],
    ["/foo/.\n./catalog/new/alpha/a", "/catalog/new/alpha/a"],
    // A fragment is not part of the pathname
    ["/catalog/new/alpha/a#fragment", "/catalog/new/alpha/a"],
  ])(
    "matches the middleware against the normalized pathname: %s",
    async (rawPath, normalizedPath) => {
      const result = (await routingHandler(
        createEvent(`${rawPath}`, `https://on${rawPath}?q=1`),
        {},
      )) as RoutingResult;

      expect(handleMiddleware.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          rawPath: normalizedPath,
          url: `https://on${normalizedPath}?q=1`,
        }),
      );
      expect(result.internalEvent.rawPath).toBe(normalizedPath);
    },
  );

  it("uses the URL pathname when the rawPath is a different path", async () => {
    await routingHandler(
      createEvent("/public", "https://on/catalog/new/alpha/a?q=1"),
      {},
    );

    expect(handleMiddleware.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        rawPath: "/catalog/new/alpha/a",
        url: "https://on/catalog/new/alpha/a?q=1",
      }),
    );
  });

  it.each([
    "/_next/data/build-id/catch/a/..json",
    "/_next/data/build-id/catch/a/...json",
    "/_next/data/build-id/catch/a/%2e%2e.json",
    "/_next/data/build-id/catch/a/%2E%2E.json",
    "/_next/data/build-id/catch/a/.%2e.json",
    "/_next/data/build-id/catch/a/%2e.json",
    "/_next/data/build-id/catch/...json",
    "/_next/data/build-id/..json",
  ])(
    "returns a 404 without running the middleware when the rawPath and URL pathname differ: %s",
    async (rawPath) => {
      const result = (await routingHandler(
        createEvent(rawPath),
        {},
      )) as InternalResult;

      expect(result.statusCode).toBe(404);
      expect(result.headers["cache-control"]).toBe(
        "private, no-cache, no-store, max-age=0, must-revalidate",
      );
      expect(handleMiddleware).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["/_next/data/build-id/catch/a.json", "/catch/a"],
    ["/_next/data/build-id/catch/a%20b.json", "/catch/a%20b"],
    ["/_next/data/build-id/catch/a..json", "/catch/a."],
    ["/_next/data/build-id/catch/.a.json", "/catch/.a"],
  ])(
    "routes data requests whose rawPath is the URL pathname: %s",
    async (rawPath, pagePath) => {
      await routingHandler(createEvent(rawPath), {});

      expect(handleMiddleware.mock.calls[0][0].rawPath).toBe(pagePath);
    },
  );

  it("redirects a data request with a trailing slash to the page like Next.js", async () => {
    const result = (await routingHandler(
      createEvent("/_next/data/build-id/catch/a/.json"),
      {},
    )) as InternalResult;

    expect(result.statusCode).toBe(308);
    expect(result.headers.Location).toBe("/catch/a");
    expect(handleMiddleware).not.toHaveBeenCalled();
  });

  it("matches next.config headers against the normalized pathname", async () => {
    configHeaders.push({
      source: "/catalog/:path*",
      regex: "^/catalog(?:/(.*))?$",
      headers: [{ key: "x-frame-options", value: "DENY" }],
    });

    try {
      const result = (await routingHandler(
        createEvent("/foo/%2e%2e/catalog/new/alpha/a"),
        {},
      )) as RoutingResult;

      expect(
        result.internalEvent.headers[
          "x-opennext-next-config-response-x-frame-options"
        ],
      ).toBe("DENY");
    } finally {
      configHeaders.length = 0;
    }
  });

  it("matches next.config redirects against the normalized pathname", async () => {
    redirects.push({
      source: "/catalog/:path*",
      destination: "/login",
      regex: "^/catalog(?:/(.*))?$",
      statusCode: 307,
    });

    try {
      const result = (await routingHandler(
        createEvent("/foo/%2e%2e/catalog/new/alpha/a"),
        {},
      )) as InternalResult;

      expect(result.statusCode).toBe(307);
      expect(result.headers.Location).toBe("/login");
      expect(handleMiddleware).not.toHaveBeenCalled();
    } finally {
      redirects.length = 0;
    }
  });

  it.each(["/foo/%252e%252e/catalog/new/alpha/a", "/foo/..%2fcatalog/x"])(
    "keeps encoded paths that are not dot segments: %s",
    async (rawPath) => {
      await routingHandler(createEvent(rawPath), {});

      expect(handleMiddleware.mock.calls[0][0].rawPath).toBe(rawPath);
    },
  );

  it("does not pass the dynamic route to the cache interceptor", async () => {
    vi.stubGlobal("openNextConfig", {
      dangerous: { enableCacheInterception: true },
    });

    await routingHandler(createEvent("/catalog/new/missing/%5Bitem%5D"), {});

    expect(cacheInterceptor).toHaveBeenCalledWith(
      expect.objectContaining({ rawPath: "/404" }),
      [],
    );
  });

  it("does not affect external rewrites", async () => {
    handleMiddleware.mockImplementation(async (event: InternalEvent) => ({
      ...event,
      rawPath: "/catalog/new/missing/[item]",
      url: "https://external.com/catalog/new/missing/[item]",
      isExternalRewrite: true,
    }));

    const result = (await routingHandler(
      createEvent("/catalog/new/missing/[item]"),
      {},
    )) as RoutingResult;

    expect(result.isExternalRewrite).toBe(true);
    expect(result.internalEvent.rawPath).toBe("/catalog/new/missing/[item]");
    expect(result.internalEvent.url).toBe(
      "https://external.com/catalog/new/missing/[item]",
    );
  });

  it.each([
    "x-middleware-rewrite",
    "x-middleware-redirect",
    "x-middleware-set-cookie",
    "x-middleware-skip",
    "x-middleware-override-headers",
    "x-middleware-next",
    "x-now-route-matches",
    "x-matched-path",
    "x-nextjs-data",
    "x-next-resume-state-length",
    "next-resume",
  ])("strips the internal %s header from the request", async (header) => {
    const event = createEvent("/catalog/new/alpha/a");
    event.headers = { [header]: "1", "x-custom": "value" };

    const result = (await routingHandler(event, {})) as RoutingResult;

    // The header must be stripped before the middleware runs
    expect(handleMiddleware.mock.calls[0][0].headers).not.toHaveProperty(
      header,
    );
    expect(result.internalEvent.headers).not.toHaveProperty(header);
    expect(result.internalEvent.headers).toEqual(
      expect.objectContaining({ "x-custom": "value" }),
    );
  });

  it("does not affect middleware responses", async () => {
    const response = {
      type: "core",
      statusCode: 200,
      headers: {},
      body: undefined,
      isBase64Encoded: false,
    };
    handleMiddleware.mockResolvedValue(response);

    const result = await routingHandler(
      createEvent("/catalog/new/missing/[item]"),
      {},
    );

    expect(result).toBe(response);
  });

  describe("next.config and middleware response headers", () => {
    const CONFIG_PREFIX = "x-opennext-next-config-response-";
    const MIDDLEWARE_PREFIX = "x-middleware-response-";

    beforeEach(() => {
      configHeaders.length = 0;
      configHeaders.push({
        source: "/(.*)",
        regex: "^/.*$",
        headers: [
          // Only differs by case from the middleware header.
          { key: "X-Both", value: "next.config" },
          { key: "x-config-only", value: "next.config" },
        ],
      });
      handleMiddleware.mockImplementation(async (event: InternalEvent) => ({
        ...event,
        responseHeaders: {
          "x-both": "middleware",
          "x-middleware-only": "middleware",
        },
      }));
    });

    afterEach(() => {
      configHeaders.length = 0;
    });

    it("keeps them apart and both values of a shared header by default", async () => {
      const result = (await routingHandler(
        createEvent("/catalog/new/alpha/a"),
        {},
      )) as RoutingResult;

      const { headers } = result.internalEvent;
      expect(headers[`${CONFIG_PREFIX}x-both`]).toBe("next.config");
      expect(headers[`${CONFIG_PREFIX}x-config-only`]).toBe("next.config");
      expect(headers[`${MIDDLEWARE_PREFIX}x-both`]).toBe("middleware");
      expect(headers[`${MIDDLEWARE_PREFIX}x-middleware-only`]).toBe(
        "middleware",
      );
      expect(headers[`${MIDDLEWARE_PREFIX}x-config-only`]).toBeUndefined();
    });

    it("drops the next.config value of a shared header with middlewareHeadersOverrideNextConfigHeaders", async () => {
      vi.stubGlobal("openNextConfig", {
        dangerous: { middlewareHeadersOverrideNextConfigHeaders: true },
      });

      const result = (await routingHandler(
        createEvent("/catalog/new/alpha/a"),
        {},
      )) as RoutingResult;

      const { headers } = result.internalEvent;
      expect(headers[`${CONFIG_PREFIX}x-both`]).toBeUndefined();
      expect(headers[`${CONFIG_PREFIX}x-config-only`]).toBe("next.config");
      expect(headers[`${MIDDLEWARE_PREFIX}x-both`]).toBe("middleware");
      expect(headers[`${MIDDLEWARE_PREFIX}x-middleware-only`]).toBe(
        "middleware",
      );
    });

    it("strips next.config response headers sent by the client", async () => {
      configHeaders.length = 0;
      const event = createEvent("/catalog/new/alpha/a");
      const result = (await routingHandler(
        {
          ...event,
          headers: { [`${CONFIG_PREFIX}content-security-policy`]: "spoofed" },
        },
        {},
      )) as RoutingResult;

      expect(
        result.internalEvent.headers[`${CONFIG_PREFIX}content-security-policy`],
      ).toBeUndefined();
    });

    it.each([
      [false, "next.config"],
      [true, "middleware"],
    ])(
      "applies them to a result without a prefix (middleware override: %s)",
      async (override, expected) => {
        vi.stubGlobal("openNextConfig", {
          dangerous: {
            enableCacheInterception: true,
            middlewareHeadersOverrideNextConfigHeaders: override,
          },
        });
        cacheInterceptor.mockImplementation(async () => ({
          type: "core",
          statusCode: 200,
          headers: {},
          body: new ReadableStream(),
          isBase64Encoded: false,
        }));

        const result = (await routingHandler(
          createEvent("/catalog/new/alpha/a"),
          {},
        )) as InternalResult;

        expect(result.headers).toEqual({
          "x-both": expected,
          "x-config-only": "next.config",
          "x-middleware-only": "middleware",
        });
      },
    );

    it.each([
      [false, "next.config"],
      [true, "middleware"],
    ])(
      "applies them to an asset result without a prefix (middleware override: %s)",
      async (override, expected) => {
        vi.stubGlobal("openNextConfig", {
          dangerous: { middlewareHeadersOverrideNextConfigHeaders: override },
        });

        const result = (await routingHandler(
          createEvent("/catalog/new/alpha/a"),
          {
            assetResolver: {
              name: "test",
              maybeGetAssetResult: async () => ({
                type: "core",
                statusCode: 200,
                headers: {},
                body: new ReadableStream(),
                isBase64Encoded: false,
              }),
            },
          },
        )) as InternalResult;

        expect(result.headers).toEqual({
          "x-both": expected,
          "x-config-only": "next.config",
          "x-middleware-only": "middleware",
        });
      },
    );
  });
});
