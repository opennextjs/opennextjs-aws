import { getRouteMatchMetadata } from "@opennextjs/aws/core/routeMatchMetadata.js";
import { vi } from "vitest";

const { NextConfig } = vi.hoisted(() => ({
  NextConfig: {} as {
    basePath?: string;
    i18n?: { locales: string[]; defaultLocale: string };
  },
}));

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({ NextConfig }));

const warn = vi.hoisted(() => vi.fn());
vi.mock("@opennextjs/aws/adapters/logger.js", () => ({ warn }));

const definition = { pathname: "/[...slug]", page: "/[...slug]/page" };
const match = { definition, params: { slug: ["foo"] } };

function createNextServer({ i18n = false } = {}) {
  return {
    getRouteDefinitions: vi.fn(),
    getRoutePatternDefinition: vi.fn().mockReturnValue(definition),
    testRouteDefinition: vi.fn().mockReturnValue(match),
    // Same result shape as the Next.js i18n provider
    i18nProvider: i18n
      ? {
          analyze: vi.fn(
            (pathname: string, options: { defaultLocale?: string } = {}) => {
              const [, segment] = pathname.split("/");
              if (segment === "en" || segment === "fr") {
                return {
                  pathname: pathname.slice(segment.length + 1) || "/",
                  detectedLocale: segment,
                  inferredFromDefault: false,
                };
              }
              return {
                pathname,
                detectedLocale: options.defaultLocale,
                inferredFromDefault: !!options.defaultLocale,
              };
            },
          ),
        }
      : undefined,
  };
}

describe("getRouteMatchMetadata", () => {
  beforeEach(() => {
    NextConfig.basePath = undefined;
    NextConfig.i18n = undefined;
    warn.mockClear();
  });

  it("returns no metadata on Next.js versions without route definitions", () => {
    expect(getRouteMatchMetadata({}, "/[...slug]", "/foo")).toStrictEqual({});
  });

  it("clears the match when the Next.js internals have changed", () => {
    const result = getRouteMatchMetadata(
      { getRouteDefinitions: vi.fn() },
      "/[...slug]",
      "/foo",
    );
    expect(result).toStrictEqual({ match: undefined });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("matches the pathname against the definition of the route", () => {
    const server = createNextServer();
    const result = getRouteMatchMetadata(server, "/[...slug]", "/foo");

    expect(result).toStrictEqual({ match });
    expect(server.getRoutePatternDefinition).toHaveBeenCalledWith(
      "/[...slug]",
      undefined,
    );
    expect(server.testRouteDefinition).toHaveBeenCalledWith(
      "/foo",
      definition,
      undefined,
    );
  });

  it("strips the trailing slash", () => {
    const server = createNextServer();
    getRouteMatchMetadata(server, "/[...slug]", "/foo/bar/");
    expect(server.testRouteDefinition.mock.calls[0][0]).toBe("/foo/bar");
  });

  it("strips the basePath", () => {
    NextConfig.basePath = "/base";
    const server = createNextServer();
    getRouteMatchMetadata(server, "/[...slug]", "/base/foo");
    getRouteMatchMetadata(server, "/[...slug]", "/base");
    getRouteMatchMetadata(server, "/[...slug]", "/based/foo");

    expect(server.testRouteDefinition.mock.calls.map(([p]) => p)).toEqual([
      "/foo",
      "/",
      "/based/foo",
    ]);
  });

  it("clears the match when the route has no definition", () => {
    const server = createNextServer();
    server.getRoutePatternDefinition.mockReturnValue(undefined);

    const result = getRouteMatchMetadata(server, "/unknown/[id]", "/unknown/1");
    expect(result).toStrictEqual({ match: undefined });
    expect(server.testRouteDefinition).not.toHaveBeenCalled();
  });

  it("clears the match when the route doesn't match the pathname", () => {
    const server = createNextServer();
    server.testRouteDefinition.mockReturnValue(null);

    const result = getRouteMatchMetadata(server, "/[slug]", "/foo/bar");
    expect(result).toStrictEqual({ match: undefined });
  });

  describe("with i18n", () => {
    beforeEach(() => {
      NextConfig.i18n = { locales: ["en", "fr"], defaultLocale: "en" };
    });

    it("looks up the definition with the locale of the pathname", () => {
      const server = createNextServer({ i18n: true });
      getRouteMatchMetadata(server, "/foo/[id]", "/fr/foo/1");

      const pathnameAnalysis = {
        pathname: "/foo/1",
        detectedLocale: "fr",
        inferredFromDefault: false,
      };
      expect(server.getRoutePatternDefinition).toHaveBeenCalledWith(
        "/foo/[id]",
        {
          pathname: "/foo/[id]",
          detectedLocale: "fr",
          inferredFromDefault: true,
        },
      );
      expect(server.testRouteDefinition).toHaveBeenCalledWith(
        "/fr/foo/1",
        definition,
        pathnameAnalysis,
      );
    });

    it("falls back to the default locale", () => {
      const server = createNextServer({ i18n: true });
      getRouteMatchMetadata(server, "/foo/[id]", "/foo/1");

      expect(
        server.getRoutePatternDefinition.mock.calls[0][1].detectedLocale,
      ).toBe("en");
      expect(server.testRouteDefinition.mock.calls[0][2]).toEqual({
        pathname: "/foo/1",
        detectedLocale: "en",
        inferredFromDefault: true,
      });
    });
  });
});
