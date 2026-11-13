import { handleMiddleware } from "@opennextjs/aws/core/routing/middleware.js";
import type { InternalEvent } from "@opennextjs/aws/types/open-next.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {},
  MiddlewareManifest: {
    sortedMiddleware: ["/"],
    middleware: {
      "/": {
        files: [],
        name: "middleware",
        page: "/",
        matchers: [
          {
            regexp: "^\\/admin(?:\\/.*)?$",
            originalSource: "/admin/:path*",
          },
        ],
      },
    },
    functions: {},
    version: 2,
  },
  FunctionsConfigManifest: undefined,
  PrerenderManifest: {
    preview: {
      previewModeId: "preview",
    },
  },
}));

vi.mock("@opennextjs/aws/core/routing/i18n/index.js", () => ({
  localizePath: (event: InternalEvent) => event.rawPath,
}));

function createEvent(rawPath: string): InternalEvent {
  return {
    type: "core",
    method: "GET",
    rawPath,
    url: `https://example.com${rawPath}`,
    body: Buffer.from(""),
    headers: {},
    query: {},
    cookies: {},
    remoteAddress: "::1",
  };
}

describe("handleMiddleware encoded path matching", () => {
  it.each(["/admin", "/%61dmin", "/adm%69n"])(
    "applies protected route middleware to %s while preserving the request URL",
    async (rawPath) => {
      const middleware = vi
        .fn()
        .mockResolvedValue(
          new Response("middleware auth required", { status: 401 }),
        );
      const middlewareLoader = vi.fn().mockResolvedValue({
        default: middleware,
      });

      const result = await handleMiddleware(
        createEvent(rawPath),
        "",
        middlewareLoader,
      );

      expect(middlewareLoader).toHaveBeenCalledOnce();
      expect(middleware).toHaveBeenCalledWith(
        expect.objectContaining({ url: `https://example.com${rawPath}` }),
      );
      expect(result).toEqual(expect.objectContaining({ statusCode: 401 }));
    },
  );
});
