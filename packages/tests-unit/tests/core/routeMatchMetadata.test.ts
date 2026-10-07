import { getRouteMatchMetadata } from "@opennextjs/aws/core/routeMatchMetadata.js";
// @ts-ignore
import BaseServer from "next/dist/server/base-server.js";
// @ts-ignore
import { I18NProvider } from "next/dist/server/lib/i18n-provider.js";
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

type Definition = {
  pathname: string;
  page: string;
  i18n?: { locale?: string };
};

/**
 * Creates a server using the route matching of the Next.js 16.4 base server,
 * with the given route definitions instead of the ones from the manifests.
 */
function createNextServer(
  definitions: Definition[],
  i18n?: { locales: string[]; defaultLocale: string },
) {
  const { prototype } = BaseServer;
  return {
    i18nProvider: i18n ? new I18NProvider(i18n) : undefined,
    getRouteDefinitions: () => definitions,
    getRouteMatchPathname: prototype.getRouteMatchPathname,
    getRoutePatternDefinition: prototype.getRoutePatternDefinition,
    testRouteDefinition: prototype.testRouteDefinition,
  };
}

const appDefinitions: Definition[] = [
  { pathname: "/[slug]", page: "/[slug]/page" },
  { pathname: "/[...slug]", page: "/[...slug]/page" },
];

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
      { getRouteDefinitions: () => appDefinitions },
      "/[...slug]",
      "/foo",
    );
    expect(result).toStrictEqual({ match: undefined });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("matches the given route rather than the most specific one", () => {
    const result = getRouteMatchMetadata(
      createNextServer(appDefinitions),
      "/[...slug]",
      "/foo",
    );
    expect(result).toStrictEqual({
      match: { definition: appDefinitions[1], params: { slug: ["foo"] } },
    });
  });

  it("ignores the trailing slash", () => {
    const result = getRouteMatchMetadata(
      createNextServer(appDefinitions),
      "/[...slug]",
      "/foo/bar/",
    );
    expect(result.match).toMatchObject({ params: { slug: ["foo", "bar"] } });
  });

  it("strips the basePath", () => {
    NextConfig.basePath = "/base";
    const server = createNextServer(appDefinitions);
    expect(
      getRouteMatchMetadata(server, "/[...slug]", "/base/foo").match,
    ).toMatchObject({ params: { slug: ["foo"] } });
    expect(
      getRouteMatchMetadata(server, "/[...slug]", "/base/").match,
    ).toBeUndefined();
  });

  it("clears the match when the route has no definition", () => {
    const result = getRouteMatchMetadata(
      createNextServer(appDefinitions),
      "/unknown/[id]",
      "/unknown/1",
    );
    expect(result).toStrictEqual({ match: undefined });
  });

  it("clears the match when the route doesn't match the pathname", () => {
    const result = getRouteMatchMetadata(
      createNextServer(appDefinitions),
      "/[slug]",
      "/foo/bar",
    );
    expect(result).toStrictEqual({ match: undefined });
  });

  describe("with i18n", () => {
    const i18n = { locales: ["en", "fr"], defaultLocale: "en" };
    const pagesDefinitions: Definition[] = [
      { pathname: "/foo/[id]", page: "/en/foo/[id]", i18n: { locale: "en" } },
      { pathname: "/foo/[id]", page: "/fr/foo/[id]", i18n: { locale: "fr" } },
      { pathname: "/[...slug]", page: "/[...slug]", i18n: {} },
    ];

    beforeEach(() => {
      NextConfig.i18n = i18n;
    });

    it("selects the definition of the pathname locale", () => {
      const result = getRouteMatchMetadata(
        createNextServer(pagesDefinitions, i18n),
        "/foo/[id]",
        "/fr/foo/1",
      );
      expect(result).toStrictEqual({
        match: { definition: pagesDefinitions[1], params: { id: "1" } },
      });
    });

    it("selects the definition of the default locale", () => {
      const result = getRouteMatchMetadata(
        createNextServer(pagesDefinitions, i18n),
        "/foo/[id]",
        "/foo/1",
      );
      expect(result).toStrictEqual({
        match: { definition: pagesDefinitions[0], params: { id: "1" } },
      });
    });

    it("matches definitions without a locale", () => {
      const result = getRouteMatchMetadata(
        createNextServer(pagesDefinitions, i18n),
        "/[...slug]",
        "/fr/foo/1/2",
      );
      expect(result.match).toMatchObject({
        definition: pagesDefinitions[2],
        params: { slug: ["foo", "1", "2"] },
      });
    });
  });
});
