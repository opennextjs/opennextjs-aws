import edgeFunctionHandler from "@opennextjs/aws/core/edgeFunctionHandler.js";
import { afterEach, beforeEach, vi } from "vitest";

const middlewareEntry = vi.fn();

beforeEach(() => {
  Object.defineProperty(globalThis, "self", {
    configurable: true,
    value: globalThis,
  });
  globalThis._ROUTES = [
    {
      name: "middleware",
      page: "/",
      regex: ["^\\/protected(?:\\/.*)?$"],
    },
  ];
  globalThis._ENTRIES = {
    middleware_middleware: {
      default: middlewareEntry,
    },
  };
  globalThis.__openNextAls = {
    getStore: () => undefined,
  } as typeof globalThis.__openNextAls;
});

afterEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(globalThis, "self");
});

// handleMiddleware's default loader imports the bundle produced from this
// handler, so this exercises the route lookup that a mocked loader bypasses.
describe("edgeFunctionHandler bundled default middleware", () => {
  it("retries route lookup with a decoded pathname and preserves the encoded request URL", async () => {
    middlewareEntry.mockResolvedValue({
      response: new Response("middleware auth required", { status: 401 }),
      waitUntil: Promise.resolve(),
    });

    const response = await edgeFunctionHandler({
      headers: {},
      method: "GET",
      signal: new AbortController().signal,
      url: "https://example.com/%70rotected",
    });

    expect(response.status).toBe(401);
    expect(middlewareEntry).toHaveBeenCalledWith({
      page: "/",
      request: expect.objectContaining({
        page: { name: "middleware" },
        url: "https://example.com/%70rotected",
      }),
    });
  });

  it("does not partially decode a malformed pathname", async () => {
    await expect(
      edgeFunctionHandler({
        headers: {},
        method: "GET",
        signal: new AbortController().signal,
        url: "https://example.com/%70rotected/%ZZ",
      }),
    ).rejects.toThrow("No route found for https://example.com/%70rotected/%ZZ");
    expect(middlewareEntry).not.toHaveBeenCalled();
  });
});
