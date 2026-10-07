import { handleNoFallbackError } from "@opennextjs/aws/core/requestHandler.js";
import type { RoutingResult } from "@opennextjs/aws/types/open-next.js";
import { vi } from "vitest";

const { requestHandler, nextHandler, getRouteMatchMetadata } = vi.hoisted(
  () => {
    const nextHandler = vi.fn();
    return {
      nextHandler,
      requestHandler: vi.fn(() => nextHandler),
      getRouteMatchMetadata: vi.fn(),
    };
  },
);

vi.mock("@opennextjs/aws/core/util.js", () => ({
  requestHandler,
  getRouteMatchMetadata,
  setNextjsPrebundledReact: vi.fn(),
}));

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {},
}));

// The routing reads manifests which are not needed by `handleNoFallbackError`.
vi.mock("@opennextjs/aws/core/routingHandler.js", () => ({
  default: vi.fn(),
}));

class NoFallbackError extends Error {}

const routingResult = {
  internalEvent: {
    type: "core",
    method: "GET",
    rawPath: "/foo",
    url: "https://example.com/foo",
    headers: {},
    query: {},
    cookies: {},
    remoteAddress: "::1",
  },
  isExternalRewrite: false,
  initialURL: "https://example.com/foo",
  resolvedRoutes: [
    { route: "/[slug]", type: "app" },
    { route: "/[...slug]", type: "app" },
    { route: "/[[...slug]]", type: "app" },
  ],
} as unknown as RoutingResult;

const req = {} as any;
const res = {} as any;

describe("handleNoFallbackError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRouteMatchMetadata.mockReturnValue({});
  });

  it("retries the next resolved route", async () => {
    await handleNoFallbackError(req, res, routingResult, {
      invokePath: "/foo",
    });

    expect(getRouteMatchMetadata).toHaveBeenCalledWith("/[...slug]", "/foo");
    expect(requestHandler).toHaveBeenCalledOnce();
    expect(requestHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        invokeOutput: "/[...slug]",
        invokePath: "/foo",
      }),
    );
    expect(nextHandler).toHaveBeenCalledWith(req, res);
  });

  it("overrides the stale match of the previous attempt", async () => {
    const match = { definition: { pathname: "/[...slug]" } };
    getRouteMatchMetadata.mockReturnValue({ match });
    await handleNoFallbackError(req, res, routingResult, {
      match: { definition: { pathname: "/[slug]" } },
    });
    expect(requestHandler.mock.calls[0][0]).toMatchObject({ match });

    requestHandler.mockClear();
    getRouteMatchMetadata.mockReturnValue({ match: undefined });
    await handleNoFallbackError(req, res, routingResult, {
      match: { definition: { pathname: "/[slug]" } },
    });
    const metadata = requestHandler.mock.calls[0][0] as Record<string, unknown>;
    expect(metadata).toHaveProperty("match", undefined);
  });

  it("retries the following route after another NoFallbackError", async () => {
    nextHandler.mockRejectedValueOnce(new NoFallbackError());
    await handleNoFallbackError(req, res, routingResult, {});

    expect(requestHandler).toHaveBeenCalledTimes(2);
    expect(requestHandler.mock.calls[1][0]).toMatchObject({
      invokeOutput: "/[[...slug]]",
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

  it("renders the 500 page when the route can't be matched", async () => {
    getRouteMatchMetadata.mockImplementation(() => {
      throw new Error("DecodeError");
    });
    await handleNoFallbackError(req, res, routingResult, {});

    expect(requestHandler).toHaveBeenCalledOnce();
    expect(requestHandler.mock.calls[0][0]).toMatchObject({
      invokePath: "/500",
      invokeStatus: 500,
    });
  });
});
