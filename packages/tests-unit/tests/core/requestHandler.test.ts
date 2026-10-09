import { handleNoFallbackError } from "@opennextjs/aws/core/requestHandler.js";
import type { RoutingResult } from "@opennextjs/aws/types/open-next.js";
import { vi } from "vitest";

const { requestHandler, nextHandler, getRouteMatchMetadata } = vi.hoisted(
  () => {
    const nextHandler = vi.fn();
    return {
      nextHandler,
      requestHandler: vi.fn(
        (_metadata: Record<string, unknown>) => nextHandler,
      ),
      getRouteMatchMetadata: vi.fn(),
    };
  },
);

vi.mock("@opennextjs/aws/core/util.js", () => ({
  requestHandler,
  setNextjsPrebundledReact: vi.fn(),
}));

vi.mock("@opennextjs/aws/core/routeMatchMetadata.js", () => ({
  getRouteMatchMetadata,
}));

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NEXT_DIR: "/var/task/.next",
  NextConfig: {},
  AppPathRoutesManifest: {},
  AppPathsManifest: {},
  PagesManifest: {
    "/decode/[...rest]": "pages/decode/[...rest].js",
  },
  RoutesManifest: {
    routes: {
      dynamic: [{ page: "/decode/[...rest]", regex: "^/decode/(.+?)(?:/)?$" }],
    },
  },
}));

// The routing reads manifests which are not needed by `handleNoFallbackError`.
vi.mock("@opennextjs/aws/core/routingHandler.js", () => ({
  default: vi.fn(),
}));

class NoFallbackError extends Error {}

const routingResult: RoutingResult = {
  internalEvent: {
    type: "core",
    method: "GET",
    rawPath: "/foo/bar",
    url: "https://example.com/foo/bar",
    headers: {},
    query: {},
    cookies: {},
    remoteAddress: "::1",
  },
  isExternalRewrite: false,
  origin: false,
  isISR: false,
  initialURL: "https://example.com/foo/bar",
  resolvedRoutes: [
    { route: "/[slug]/[id]", type: "app" },
    { route: "/[slug]/[...rest]", type: "app" },
    { route: "/[...rest]", type: "app" },
  ],
};

const req = {} as any;
const res = {} as any;

describe("handleNoFallbackError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextHandler.mockReset();
    getRouteMatchMetadata.mockReset().mockReturnValue({ match: undefined });
    vi.stubGlobal("nextVersion", "16.4.0");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects the next route with match metadata on Next.js 16.4.0", async () => {
    const match = {
      definition: { pathname: "/[slug]/[...rest]" },
      params: { slug: "foo", rest: ["bar"] },
    };
    getRouteMatchMetadata.mockReturnValue({ match });

    await handleNoFallbackError(req, res, routingResult, {
      invokePath: "/foo/bar",
    });

    expect(getRouteMatchMetadata).toHaveBeenCalledOnce();
    expect(getRouteMatchMetadata).toHaveBeenCalledWith(
      "/[slug]/[...rest]",
      "/foo/bar",
    );
    expect(requestHandler).toHaveBeenCalledOnce();
    expect(requestHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        invokeOutput: "/[slug]/[...rest]",
        invokePath: "/foo/bar",
        match,
      }),
    );
    expect(nextHandler).toHaveBeenCalledWith(req, res);
  });

  it("overrides the stale match of the previous attempt", async () => {
    const match = { definition: { pathname: "/[slug]/[...rest]" } };
    getRouteMatchMetadata.mockReturnValue({ match });
    await handleNoFallbackError(req, res, routingResult, {
      match: { definition: { pathname: "/[slug]/[id]" } },
    });
    expect(requestHandler.mock.calls[0][0]).toMatchObject({ match });

    requestHandler.mockClear();
    getRouteMatchMetadata.mockReturnValue({ match: undefined });
    await handleNoFallbackError(req, res, routingResult, {
      match: { definition: { pathname: "/[slug]/[id]" } },
    });
    const metadata = requestHandler.mock.calls[0][0] as Record<string, unknown>;
    expect(metadata).toHaveProperty("match", undefined);
  });

  it("retries the following route after another NoFallbackError", async () => {
    nextHandler.mockRejectedValueOnce(new NoFallbackError());
    await handleNoFallbackError(req, res, routingResult, {});

    expect(requestHandler).toHaveBeenCalledTimes(2);
    expect(requestHandler.mock.calls[1][0]).toMatchObject({
      invokeOutput: "/[...rest]",
    });
  });

  it("renders the 404 page when no route is left", async () => {
    nextHandler.mockRejectedValueOnce(new NoFallbackError());
    nextHandler.mockRejectedValueOnce(new NoFallbackError());
    await handleNoFallbackError(req, res, routingResult, {});

    expect(requestHandler).toHaveBeenCalledTimes(3);
    expect(requestHandler.mock.calls[2][0]).toMatchObject({
      invokePath: "/404",
      invokeStatus: 404,
    });
  });

  it("renders the 500 page when match generation throws", async () => {
    getRouteMatchMetadata.mockImplementation(() => {
      throw new URIError("URI malformed");
    });
    await handleNoFallbackError(req, res, routingResult, {});

    expect(requestHandler).toHaveBeenCalledOnce();
    expect(requestHandler.mock.calls[0][0]).toMatchObject({
      invokePath: "/500",
      invokeStatus: 500,
    });
  });

  describe.each(["15.5.27", "16.3.8"])("Next.js %s", (version) => {
    beforeEach(() => {
      vi.stubGlobal("nextVersion", version);
    });

    it("preserves existing metadata across retries without generating a match", async () => {
      const match = { definition: { pathname: "/[slug]/[id]" } };
      const metadata = {
        invokePath: "/foo/bar",
        invokeQuery: { search: "a+b" },
        match,
      };
      nextHandler.mockRejectedValueOnce(new NoFallbackError());

      await handleNoFallbackError(req, res, routingResult, metadata);

      expect(getRouteMatchMetadata).not.toHaveBeenCalled();
      expect(requestHandler).toHaveBeenCalledTimes(2);
      expect(requestHandler).toHaveBeenNthCalledWith(1, {
        ...routingResult,
        invokeOutput: "/[slug]/[...rest]",
        ...metadata,
      });
      expect(requestHandler).toHaveBeenNthCalledWith(2, {
        ...routingResult,
        invokeOutput: "/[...rest]",
        ...metadata,
      });
      for (const [actualMetadata] of requestHandler.mock.calls) {
        expect(actualMetadata.match).toBe(match);
      }
      expect(nextHandler).toHaveBeenCalledTimes(2);
      expect(nextHandler).toHaveBeenCalledWith(req, res);
    });

    it("does not introduce a match property when none was supplied", async () => {
      await handleNoFallbackError(req, res, routingResult, {});

      expect(getRouteMatchMetadata).not.toHaveBeenCalled();
      expect(requestHandler).toHaveBeenCalledOnce();
      expect(requestHandler.mock.calls[0][0]).not.toHaveProperty("match");
      expect(nextHandler).toHaveBeenCalledWith(req, res);
    });

    it("leaves malformed fallback parameter decoding to Next.js", async () => {
      const actual = await vi.importActual<
        typeof import("@opennextjs/aws/core/routeMatchMetadata.js")
      >("@opennextjs/aws/core/routeMatchMetadata.js");
      const rawPath = "/decode/%ZZ/x";
      // The first route captures only `x`; the catch-all would also decode `%ZZ`.
      const malformedRoutingResult: RoutingResult = {
        ...routingResult,
        initialURL: `https://example.com${rawPath}`,
        internalEvent: {
          ...routingResult.internalEvent,
          rawPath,
          url: `https://example.com${rawPath}`,
        },
        resolvedRoutes: [
          { route: "/decode/%ZZ/[id]", type: "page" },
          { route: "/decode/[...rest]", type: "page" },
        ],
      };
      expect(() =>
        actual.getRouteMatchMetadata("/decode/[...rest]", rawPath),
      ).toThrow(URIError);
      getRouteMatchMetadata.mockImplementation(actual.getRouteMatchMetadata);

      await handleNoFallbackError(req, res, malformedRoutingResult, {
        invokePath: rawPath,
      });

      expect(getRouteMatchMetadata).not.toHaveBeenCalled();
      expect(requestHandler).toHaveBeenCalledOnce();
      expect(requestHandler).toHaveBeenCalledWith({
        ...malformedRoutingResult,
        invokeOutput: "/decode/[...rest]",
        invokePath: rawPath,
      });
      expect(nextHandler).toHaveBeenCalledWith(req, res);
    });
  });
});
