import {
  getNextConfigHeaders,
  handleRewrites,
} from "@opennextjs/aws/core/routing/matcher.js";
import type { InternalEvent } from "@opennextjs/aws/types/open-next.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {
    basePath: "/docs",
    i18n: {
      defaultLocale: "en",
      locales: ["en", "en-US", "fr"],
    },
  },
  AppPathRoutesManifest: {},
  RoutesManifest: {
    version: 3,
    pages404: true,
    caseSensitive: false,
    basePath: "/docs",
    locales: ["en", "en-US", "fr"],
    redirects: [],
    headers: [],
    routes: { dynamic: [], static: [] },
  },
  PagesManifest: {},
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

// Routes have the shape Next.js generates with `basePath: "/docs"` and i18n: the locale follows the basePath.
describe("getNextConfigHeaders with basePath and i18n", () => {
  const configHeaders = [
    {
      source: "/docs/:nextInternalLocale(en|en\\-US|fr)/admin/:path*",
      regex:
        "^/docs(?:/(en|en\\-US|fr))/admin(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?(?:/)?$",
      headers: [{ key: "X-Frame-Options", value: "DENY" }],
    },
  ];

  it.each(["/docs/admin", "/docs/admin/users", "/docs/fr/admin"])(
    "should apply the headers to %s",
    (rawPath) => {
      expect(getNextConfigHeaders(createEvent(rawPath), configHeaders)).toEqual(
        { "x-frame-options": "DENY" },
      );
    },
  );

  it.each(["/docs/public", "/admin"])(
    "should not apply the headers to %s",
    (rawPath) => {
      expect(getNextConfigHeaders(createEvent(rawPath), configHeaders)).toEqual(
        {},
      );
    },
  );
});

describe("handleRewrites with basePath and i18n", () => {
  it("should rewrite to an API route without the locale", () => {
    const rewrites = [
      {
        source: "/docs/:nextInternalLocale(en|en\\-US|fr)/users",
        destination: "/docs/:nextInternalLocale/api/users",
        regex: "^/docs(?:/(en|en\\-US|fr))/users(?:/)?$",
      },
    ];

    const { internalEvent, __rewrite } = handleRewrites(
      createEvent("/docs/users"),
      rewrites,
    );

    expect(__rewrite).toEqual(rewrites[0]);
    expect(internalEvent.rawPath).toBe("/docs/api/users");
  });

  it.each([
    ["/docs/en/api/users", "/docs/api/users"],
    ["/docs/en-US/api/users", "/docs/api/users"],
    ["/docs/EN-us/api/users", "/docs/api/users"],
    ["/en-US/api/users", "/api/users"],
    // Not a locale
    ["/docs/english/api/users", "/docs/english/api/users"],
    // Not an API route
    ["/docs/en-US/apis/users", "/docs/en-US/apis/users"],
  ])(
    "should only remove a whole locale segment when rewriting to %s",
    (destination, expectedPath) => {
      const { internalEvent } = handleRewrites(createEvent("/docs/users"), [
        {
          source: "/docs/users",
          destination,
          regex: "^/docs/users$",
          locale: false,
        },
      ]);

      expect(internalEvent.rawPath).toBe(expectedPath);
    },
  );

  it("should keep the locale when rewriting to a page", () => {
    const rewrites = [
      {
        source: "/docs/:nextInternalLocale(en|en\\-US|fr)/about",
        destination: "/docs/:nextInternalLocale/company",
        regex: "^/docs(?:/(en|en\\-US|fr))/about(?:/)?$",
      },
    ];

    const { internalEvent } = handleRewrites(
      createEvent("/docs/fr/about"),
      rewrites,
    );

    expect(internalEvent.rawPath).toBe("/docs/fr/company");
  });
});
