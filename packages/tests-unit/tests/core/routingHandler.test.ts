import routingHandler from "@opennextjs/aws/core/routingHandler.js";
import type {
  InternalEvent,
  RoutingResult,
} from "@opennextjs/aws/types/open-next.js";
import { vi } from "vitest";

const { handleMiddleware, cacheInterceptor } = vi.hoisted(() => ({
  handleMiddleware: vi.fn(),
  cacheInterceptor: vi.fn(),
}));

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  BuildId: "build-id",
  ConfigHeaders: [],
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
    redirects: [],
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
    // The rawPath only matches the catch-all route, Next.js receives `/catalog/new/missing/[item]/`
    const result = (await routingHandler(
      createEvent("/catalog/new/missing/[item]/%2e"),
      {},
    )) as RoutingResult;

    expect(result.internalEvent.rawPath).toBe("/404");
    expect(result.resolvedRoutes).toEqual([]);
  });

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
});
