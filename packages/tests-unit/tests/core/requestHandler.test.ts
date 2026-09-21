import { openNextHandler } from "@opennextjs/aws/core/requestHandler.js";
import routingHandler from "@opennextjs/aws/core/routingHandler.js";
import { requestHandler } from "@opennextjs/aws/core/util.js";
import type {
  InternalEvent,
  RoutingResult,
} from "@opennextjs/aws/types/open-next.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {},
  HtmlPages: [],
}));

vi.mock("@opennextjs/aws/core/patchAsyncStorage.js", () => ({
  patchAsyncStorage: vi.fn(),
}));

// Importing the real module would start a Next server
vi.mock("@opennextjs/aws/core/util.js", () => ({
  requestHandler: vi.fn(),
  setNextjsPrebundledReact: vi.fn(),
}));

vi.mock("@opennextjs/aws/core/routingHandler.js", () => ({
  default: vi.fn(),
  MIDDLEWARE_HEADER_PREFIX: "x-middleware-response-",
  MIDDLEWARE_HEADER_PREFIX_LEN: "x-middleware-response-".length,
  INTERNAL_HEADER_INITIAL_URL: "x-opennext-initial-url",
  INTERNAL_HEADER_RESOLVED_ROUTES: "x-opennext-resolved-routes",
  INTERNAL_HEADER_REWRITE_STATUS_CODE: "x-opennext-rewrite-status-code",
  INTERNAL_EVENT_REQUEST_ID: "x-opennext-request-id",
}));

function createEvent(url: string, rawPath: string): InternalEvent {
  return {
    type: "core",
    method: "GET",
    rawPath,
    url,
    headers: { host: "on" },
    query: Object.fromEntries(new URL(url).searchParams),
    cookies: {},
    remoteAddress: "::1",
  };
}

function createRoutingResult(
  internalEvent: InternalEvent,
  initialURL: string,
): RoutingResult {
  return {
    internalEvent,
    isExternalRewrite: false,
    origin: false,
    isISR: false,
    resolvedRoutes: [],
    initialURL,
  };
}

describe("openNextHandler", () => {
  const nextHandler = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.openNextConfig = {};
    globalThis.__next_route_preloader = vi.fn();
    nextHandler.mockImplementation(async (_req, res) => {
      res.end("");
    });
    vi.mocked(requestHandler).mockReturnValue(nextHandler);
  });

  it("should pass the query to Next", async () => {
    const event = createEvent("https://on/ssr?hello=world", "/ssr");
    vi.mocked(routingHandler).mockResolvedValue(
      createRoutingResult(event, event.url),
    );

    await openNextHandler(event);

    expect(requestHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        isNextDataReq: false,
        invokePath: "/ssr",
        invokeQuery: { hello: "world" },
      }),
    );
    expect(nextHandler.mock.calls[0][0].url).toBe("/ssr?hello=world");
  });

  it("should not leak __nextDataReq into the query for data requests", async () => {
    const initialURL = "https://on/_next/data/build-id/ssr.json?hello=world";
    // This is what the routing layer returns for the data request above (see `fixDataPage`)
    const routedEvent = createEvent(
      "https://on/ssr?hello=world&__nextDataReq=1",
      "/ssr",
    );
    vi.mocked(routingHandler).mockResolvedValue(
      createRoutingResult(routedEvent, initialURL),
    );

    await openNextHandler(
      createEvent(initialURL, "/_next/data/build-id/ssr.json"),
    );

    expect(requestHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        isNextDataReq: true,
        invokePath: "/ssr",
        invokeQuery: { hello: "world" },
      }),
    );
    expect(nextHandler.mock.calls[0][0].url).toBe(
      "/_next/data/build-id/ssr.json?hello=world",
    );
  });
});
