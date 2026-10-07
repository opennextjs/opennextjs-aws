import { NextConfig } from "@opennextjs/aws/adapters/config/index.js";
import {
  fixDataPage,
  getNextConfigHeaders,
  handleRedirects,
  handleRewrites,
} from "@opennextjs/aws/core/routing/matcher.js";
import { convertFromQueryString } from "@opennextjs/aws/core/routing/util.js";
import type { RouteHas } from "@opennextjs/aws/types/next-types.js";
import type { InternalEvent } from "@opennextjs/aws/types/open-next.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {},
  AppPathRoutesManifest: {
    "/api/app/route": "/api/app",
    "/app/page": "/app",
    "/catchAll/[...slug]/page": "/catchAll/[...slug]",
  },
  RoutesManifest: {
    version: 3,
    pages404: true,
    caseSensitive: false,
    basePath: "",
    locales: [],
    redirects: [],
    headers: [],
    routes: {
      dynamic: [
        {
          page: "/catchAll/[...slug]",
          regex: "^/catchAll/(.+?)(?:/)?$",
          routeKeys: {
            nxtPslug: "nxtPslug",
          },
          namedRegex: "^/catchAll/(?<nxtPslug>.+?)(?:/)?$",
        },
        {
          page: "/page/catchAll/[...slug]",
          regex: "^/page/catchAll/(.+?)(?:/)?$",
          routeKeys: {
            nxtPslug: "nxtPslug",
          },
          namedRegex: "^/page/catchAll/(?<nxtPslug>.+?)(?:/)?$",
        },
      ],
      static: [
        {
          page: "/app",
          regex: "^/app(?:/)?$",
          routeKeys: {},
          namedRegex: "^/app(?:/)?$",
        },
        {
          page: "/page",
          regex: "^/page(?:/)?$",
          routeKeys: {},
          namedRegex: "^/page(?:/)?$",
        },
        {
          page: "/page/catchAll/static",
          regex: "^/page/catchAll/static(?:/)?$",
          routeKeys: {},
          namedRegex: "^/page/catchAll/static(?:/)?$",
        },
      ],
    },
  },
  PagesManifest: {
    "/_app": "pages/_app.js",
    "/_document": "pages/_document.js",
    "/_error": "pages/_error.js",
    "/404": "pages/404.html",
  },
}));

vi.mock("@opennextjs/aws/core/routing/i18n/index.js", () => ({
  localizePath: (event: InternalEvent) => event.rawPath,
  handleLocaleRedirect: (_event: InternalEvent) => false,
}));

type PartialEvent = Partial<
  Omit<InternalEvent, "body" | "rawPath" | "query">
> & { body?: string };

function createEvent(event: PartialEvent): InternalEvent {
  const url = event.url ?? "https://on/";
  const { pathname, search } = new URL(url);
  return {
    type: "core",
    method: event.method ?? "GET",
    rawPath: pathname,
    url: event.url ?? "/",
    body: Buffer.from(event.body ?? ""),
    headers: event.headers ?? {},
    query: convertFromQueryString(search.slice(1)),
    cookies: event.cookies ?? {},
    remoteAddress: event.remoteAddress ?? "::1",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getNextConfigHeaders", () => {
  it("should return empty object for undefined configHeaders", () => {
    const event = createEvent({});
    const result = getNextConfigHeaders(event);

    expect(result).toEqual({});
  });

  it("should return empty object for empty configHeaders", () => {
    const event = createEvent({});
    const result = getNextConfigHeaders(event, []);

    expect(result).toEqual({});
  });

  it("should return request headers for matching / route", () => {
    const event = createEvent({
      url: "https://on/",
    });

    const result = getNextConfigHeaders(event, [
      {
        source: "/",
        regex: "^/$",
        headers: [
          {
            key: "foo",
            value: "bar",
          },
        ],
      },
    ]);

    expect(result).toEqual({
      foo: "bar",
    });
  });

  it("should return empty request headers for matching / route with empty headers", () => {
    const event = createEvent({
      url: "https://on/",
    });

    const result = getNextConfigHeaders(event, [
      {
        source: "/",
        regex: "^/$",
        headers: [],
      },
    ]);

    expect(result).toEqual({});
  });

  it("should return request headers for matching /* route", () => {
    const event = createEvent({
      url: "https://on/hello-world",
    });

    const result = getNextConfigHeaders(event, [
      {
        source: "/(.*)",
        regex: "^(?:/(.*))(?:/)?$",
        headers: [
          {
            key: "foo",
            value: "bar",
          },
          {
            key: "hello",
            value: "world",
          },
        ],
      },
    ]);

    expect(result).toEqual({
      foo: "bar",
      hello: "world",
    });
  });

  it("should return request headers for matching /* route with has condition", () => {
    const event = createEvent({
      url: "https://on/hello-world",
      cookies: {
        match: "true",
      },
    });

    const result = getNextConfigHeaders(event, [
      {
        source: "/(.*)",
        regex: "^(?:/(.*))(?:/)?$",
        headers: [
          {
            key: "foo",
            value: "bar",
          },
        ],
        has: [{ type: "cookie", key: "match" }],
      },
    ]);

    expect(result).toEqual({
      foo: "bar",
    });
  });

  it.each([
    {
      name: "header",
      event: { headers: { "x-forwarded-proto": "https" } },
      has: {
        type: "header",
        key: "x-forwarded-proto",
        value: "http",
      },
    },
    {
      name: "cookie",
      event: { cookies: { protocol: "https" } },
      has: { type: "cookie", key: "protocol", value: "http" },
    },
    {
      name: "query",
      event: { url: "https://on/hello-world?protocol=https" },
      has: { type: "query", key: "protocol", value: "http" },
    },
    {
      name: "host",
      event: { headers: { host: "not-on.example" } },
      has: { type: "host", value: "on.example" },
    },
  ] satisfies {
    name: string;
    event: PartialEvent;
    has: RouteHas;
  }[])("should require an exact $name value match", ({ event, has }) => {
    const result = getNextConfigHeaders(createEvent(event), [
      {
        source: "/(.*)",
        regex: "^(?:/(.*))(?:/)?$",
        headers: [{ key: "foo", value: "bar" }],
        has: [has],
      },
    ]);

    expect(result).toEqual({});
  });

  it("should not match an absent value-less query condition", () => {
    const event = createEvent({
      url: "https://on/hello-world",
    });

    const result = getNextConfigHeaders(event, [
      {
        source: "/(.*)",
        regex: "^(?:/(.*))(?:/)?$",
        headers: [{ key: "x-robots-tag", value: "noindex" }],
        has: [{ type: "query", key: "preview" }],
      },
    ]);

    expect(result).toEqual({});
  });

  it("should match a present value-less query condition", () => {
    const event = createEvent({
      url: "https://on/hello-world?preview=1",
    });

    const result = getNextConfigHeaders(event, [
      {
        source: "/(.*)",
        regex: "^(?:/(.*))(?:/)?$",
        headers: [{ key: "x-robots-tag", value: "noindex" }],
        has: [{ type: "query", key: "preview" }],
      },
    ]);

    expect(result).toEqual({ "x-robots-tag": "noindex" });
  });

  // Next.js checks whether the repeated query parameter is present before
  // matching its final value. https://github.com/vercel/next.js/blob/ae745ba/packages/next/src/shared/lib/router/utils/prepare-destination.ts#L92-L115
  it.each([
    { value: undefined, matches: true },
    { value: ".*", matches: true },
    { value: ".+", matches: false },
  ])(
    "should match a repeated query ending empty against $value",
    ({ value, matches }) => {
      const event = createEvent({
        url: "https://on/hello-world?preview=1&preview=",
      });

      const result = getNextConfigHeaders(event, [
        {
          source: "/(.*)",
          regex: "^(?:/(.*))(?:/)?$",
          headers: [{ key: "x-robots-tag", value: "noindex" }],
          has: [{ type: "query", key: "preview", value }],
        },
      ]);

      expect(result).toEqual(matches ? { "x-robots-tag": "noindex" } : {});
    },
  );

  it("should return request headers for matching /* route with missing condition", () => {
    const event = createEvent({
      url: "https://on/hello-world",
      cookies: {
        match: "true",
      },
    });

    const result = getNextConfigHeaders(event, [
      {
        source: "/(.*)",
        regex: "^(?:/(.*))(?:/)?$",
        headers: [
          {
            key: "foo",
            value: "bar",
          },
        ],
        missing: [{ type: "cookie", key: "missing" }],
      },
    ]);

    expect(result).toEqual({
      foo: "bar",
    });
  });

  it("should return request headers for matching /* route with has and missing condition", () => {
    const event = createEvent({
      url: "https://on/hello-world",
      cookies: {
        match: "true",
      },
    });

    const result = getNextConfigHeaders(event, [
      {
        source: "/(.*)",
        regex: "^(?:/(.*))(?:/)?$",
        headers: [
          {
            key: "foo",
            value: "bar",
          },
        ],
        has: [{ type: "cookie", key: "match" }],
        missing: [{ type: "cookie", key: "missing" }],
      },
    ]);

    expect(result).toEqual({
      foo: "bar",
    });
  });

  // Next.js merges successful condition parameters into source parameters
  // before compiling configured header keys and values.
  // https://github.com/vercel/next.js/blob/ae745ba/packages/next/src/server/lib/router-utils/resolve-routes.ts#L400-L414
  // https://github.com/vercel/next.js/blob/ae745ba/packages/next/src/server/lib/router-utils/resolve-routes.ts#L841-L860
  it("should interpolate named and value-less conditions in header keys and values", () => {
    const event = createEvent({
      url: "https://on/headers?tenant=alpha&my-query=beta&items=one&items=two",
    });

    const result = getNextConfigHeaders(event, [
      {
        source: "/headers",
        regex: "^/headers(?:/)?$",
        has: [
          {
            type: "query",
            key: "tenant",
            value: "(?<tenant>.*)",
          },
          { type: "query", key: "my-query" },
          { type: "query", key: "items" },
        ],
        headers: [
          { key: "x-:tenant", value: ":myquery" },
          { key: "x-items", value: ":items*" },
          {
            key: "x-url",
            value: "https://example.com/path?tenant=:tenant&next=(literal)+*",
          },
          { key: "x-literal", value: "urn:test:(literal)+*" },
        ],
      },
    ]);

    expect(result).toEqual({
      "x-alpha": "beta",
      "x-items": "one/two",
      "x-url": "https://example.com/path?tenant=alpha&next=(literal)+*",
      "x-literal": "urn:test:(literal)+*",
    });
  });

  it("should let a condition parameter override a source parameter in headers", () => {
    const event = createEvent({
      url: "https://on/headers/from-source?tenant=condition",
    });

    const result = getNextConfigHeaders(event, [
      {
        source: "/headers/:value",
        regex: "^/headers(?:/([^/]+?))(?:/)?$",
        has: [
          {
            type: "query",
            key: "tenant",
            value: "(?<value>.*)",
          },
        ],
        missing: [
          {
            type: "query",
            key: "blocked",
            value: "(?<value>.*)",
          },
        ],
        headers: [{ key: "x-value", value: ":value" }],
      },
    ]);

    expect(result).toEqual({ "x-value": "condition" });
  });

  it.todo(
    "should exercise the error scenario: 'Error matching header <key> with value <value>'",
  );
});

describe("handleRedirects", () => {
  it("should redirect repeated slashes", () => {
    const event = createEvent({
      url: "https://on/api-route//foo",
    });

    const result = handleRedirects(event, []);

    expect(result.statusCode).toEqual(308);
    expect(result.headers.Location).toEqual("https://on/api-route/foo");
  });

  it("should redirect trailing slash by default", () => {
    const event = createEvent({
      url: "https://on/api-route/",
    });

    const result = handleRedirects(event, []);

    expect(result.statusCode).toEqual(308);
    expect(result.headers.Location).toEqual("https://on/api-route");
  });

  it("should not redirect trailing slash when skipTrailingSlashRedirect is true", () => {
    const event = createEvent({
      url: "https://on/api-route/",
    });

    NextConfig.skipTrailingSlashRedirect = true;
    const result = handleRedirects(event, []);

    expect(result).toBeUndefined();
  });

  it("should redirect matching path", () => {
    const event = createEvent({
      url: "https://on/api-route",
    });

    const result = handleRedirects(event, [
      {
        source: "/:path+",
        destination: "/new/:path+",
        locale: false,
        statusCode: 308,
        regex: "^(?!/_next)(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))(?:/)?$",
      },
    ]);

    expect(result.headers.Location).toBe("https://on/new/api-route");
  });

  it("should redirect matching nested path", () => {
    const event = createEvent({
      url: "https://on/api-route/secret",
    });

    const result = handleRedirects(event, [
      {
        source: "/:path+",
        destination: "/new/:path+",
        locale: false,
        statusCode: 308,
        regex: "^(?!/_next)(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))(?:/)?$",
      },
    ]);

    expect(result.headers.Location).toBe("https://on/new/api-route/secret");
  });

  // Next.js compiles an empty optional catch-all instead of leaving the token
  // in the destination. https://github.com/vercel/next.js/blob/ae745ba/packages/next/src/shared/lib/router/utils/prepare-destination.ts#L254-L264
  it.each([
    {
      destination: "https://example.com/:path*",
      location: "https://example.com/",
    },
    {
      destination: "https://example.com/:path*#section",
      location: "https://example.com/#section",
    },
  ])(
    "should redirect an empty optional catch-all to $location",
    ({ destination, location }) => {
      const event = createEvent({
        url: "https://on/",
      });

      const result = handleRedirects(event, [
        {
          source: "/:path*",
          destination,
          locale: false,
          statusCode: 308,
          regex: "^(?!/_next)(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?(?:/)?$",
        },
      ]);

      expect(result.headers.Location).toBe(location);
    },
  );

  it("should not redirect unmatched path", () => {
    const event = createEvent({
      url: "https://on/api-route",
    });

    const result = handleRedirects(event, [
      {
        source: "/foo/",
        destination: "/bar",
        locale: false,
        statusCode: 307,
        regex: "^(?!/_next)/foo/(?:/)?$",
      },
    ]);

    expect(result).toBeUndefined();
  });

  it("should redirect with + character and query string", () => {
    const event = createEvent({
      url: "https://on/foo",
    });

    const result = handleRedirects(event, [
      {
        source: "/foo",
        destination: "/search?bar=hello+world&baz=new%2C+earth",
        locale: false,
        statusCode: 308,
        regex: "^(?!/_next)/foo(?:/)?$",
      },
    ]);

    expect(result.statusCode).toEqual(308);
    expect(result.headers.Location).toEqual(
      "https://on/search?bar=hello+world&baz=new%2C+earth",
    );
  });

  // For reference https://github.com/opennextjs/opennextjs-aws/issues/1217
  it("should redirect to the root with a query string", () => {
    const event = createEvent({
      url: "https://on/promo/anything",
    });

    const result = handleRedirects(event, [
      {
        source: "/promo/:path*",
        destination: "/?ref=promo",
        locale: false,
        statusCode: 308,
        regex: "^(?!/_next)/promo(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?(?:/)?$",
      },
    ]);

    expect(result.statusCode).toEqual(308);
    expect(result.headers.Location).toEqual("https://on/?ref=promo");
  });
});

describe("handleRewrites", () => {
  it("should not rewrite with empty rewrites", () => {
    const event = createEvent({
      url: "https://on/foo?hello=world",
    });

    const result = handleRewrites(event, []);

    expect(result).toEqual({
      internalEvent: event,
      isExternalRewrite: false,
    });
  });

  it("should rewrite with params", () => {
    const event = createEvent({
      url: "https://on/albums/foo/bar",
    });

    const rewrites = [
      {
        source: "/albums/:album",
        destination: "/rewrite/albums/:album",
        regex: "^/albums(?:/([^/]+?))(?:/)?$",
      },
      {
        source: "/albums/:album/:song",
        destination: "/rewrite/albums/:album/:song",
        regex: "^/albums(?:/([^/]+?))(?:/([^/]+?))(?:/)?$",
      },
    ];
    const result = handleRewrites(event, rewrites);

    expect(result).toEqual({
      internalEvent: {
        ...event,
        rawPath: "/rewrite/albums/foo/bar",
        url: "https://on/rewrite/albums/foo/bar",
      },
      __rewrite: rewrites[1],
      isExternalRewrite: false,
    });
  });

  // Next.js disables path-to-regexp value validation when compiling a matched
  // destination. https://github.com/vercel/next.js/blob/ae745ba/packages/next/src/shared/lib/router/utils/prepare-destination.ts#L254-L264
  it.each([
    { path: "/capture/", destination: "https://on/target/" },
    { path: "/capture/a/b", destination: "https://on/target/a/b" },
  ])("should compile the captured path in $path", ({ path, destination }) => {
    const event = createEvent({
      url: `https://on${path}`,
    });
    const rewrites = [
      {
        source: "/capture/:value(.*)",
        destination: "/target/:value",
        regex: "^/capture(?:/(.*))(?:/)?$",
      },
    ];

    const result = handleRewrites(event, rewrites);

    expect(result.internalEvent.url).toBe(destination);
  });

  // Next.js compiles non-path values without validating them against a path
  // segment pattern. https://github.com/vercel/next.js/blob/ae745ba/packages/next/src/shared/lib/router/utils/prepare-destination.ts#L127-L160
  it("should compile a slash-containing condition capture in the query", () => {
    const event = createEvent({
      url: "https://on/capture-query?value=a/b",
    });
    const rewrites = [
      {
        source: "/capture-query",
        destination: "/target?next=:value",
        regex: "^/capture-query(?:/)?$",
        has: [
          {
            type: "query" as const,
            key: "value",
            value: "(?<value>.*)",
          },
        ],
      },
    ];

    const result = handleRewrites(event, rewrites);

    expect(result.internalEvent).toEqual({
      ...event,
      query: { value: "a/b", next: "a/b" },
      rawPath: "/target",
      url: "https://on/target?value=a/b&next=a/b",
    });
  });

  // Adapted from Next.js's duplicate-query redirect regression.
  // https://github.com/vercel/next.js/blob/ae745ba/test/e2e/custom-routes/custom-routes.test.ts#L1314-L1331
  it.each([
    {
      search: "value=first&value=last",
      rewrittenSearch: "value=first&value=last",
      selected: "last",
    },
    {
      search: "value=first&value=",
      rewrittenSearch: "value=first&value=",
      selected: "",
    },
    {
      search: "value=first&value",
      rewrittenSearch: "value=first&value=",
      selected: "",
    },
  ])(
    "should capture the final repeated query value from $search",
    ({ search, rewrittenSearch, selected }) => {
      const event = createEvent({
        url: `https://on/repeated-query?${search}`,
      });
      const rewrites = [
        {
          source: "/repeated-query",
          destination: "/target?selected=:selected",
          regex: "^/repeated-query(?:/)?$",
          has: [
            {
              type: "query" as const,
              key: "value",
              value: "(?<selected>.*)",
            },
          ],
        },
      ];

      const result = handleRewrites(event, rewrites);

      expect(result.internalEvent).toEqual({
        ...event,
        query: { value: ["first", selected], selected },
        rawPath: "/target",
        url: `https://on/target?${rewrittenSearch}&selected=${selected}`,
      });
      expect(result.__rewrite).toBe(rewrites[0]);
    },
  );

  it("should still reject a missing required destination parameter", () => {
    const event = createEvent({
      url: "https://on/capture",
    });

    expect(() =>
      handleRewrites(event, [
        {
          source: "/capture",
          destination: "/target/:missing",
          regex: "^/capture(?:/)?$",
        },
      ]),
    ).toThrow('Expected "missing" to be a string');
  });

  // Next.js encodes hostname parameters when compiling external destinations.
  // https://github.com/vercel/next.js/blob/ae745ba/packages/next/src/shared/lib/router/utils/prepare-destination.ts#L265-L270
  it("should not let a captured slash reshape the destination authority", () => {
    const event = createEvent({
      url: "https://on/capture-host?tenant=evil.com/",
    });

    expect(() =>
      handleRewrites(event, [
        {
          source: "/capture-host",
          destination: "https://:tenant.internal/target",
          regex: "^/capture-host(?:/)?$",
          has: [
            {
              type: "query",
              key: "tenant",
              value: "(?<tenant>.*)",
            },
          ],
        },
      ]),
    ).toThrow("Invalid URL");
  });

  // Adapted from Next.js's host capture redirect regression.
  // https://github.com/vercel/next.js/blob/ae745ba/test/e2e/custom-routes/custom-routes.test.ts#L1292-L1312
  it("should capture from a normalized hostname", () => {
    const event = createEvent({
      url: "https://on/capture-host",
      headers: { host: "HELLO-test.EXAMPLE.com:3000" },
    });
    const rewrites = [
      {
        source: "/capture-host",
        destination: "https://:subdomain.example.com/target",
        regex: "^/capture-host(?:/)?$",
        has: [
          {
            type: "host" as const,
            value: "(?<subdomain>.*)-test\\.example\\.com",
          },
        ],
      },
    ];

    const result = handleRewrites(event, rewrites);

    expect(result.internalEvent).toEqual({
      ...event,
      rawPath: "/target",
      url: "https://hello.example.com/target",
    });
    expect(result.__rewrite).toBe(rewrites[0]);
    expect(result.isExternalRewrite).toBe(true);
  });

  // Next.js exposes the full match as `host` when a host pattern has no named
  // groups. https://github.com/vercel/next.js/blob/ae745ba/packages/next/src/shared/lib/router/utils/prepare-destination.ts#L101-L110
  it("should expose the normalized hostname as an implicit host capture", () => {
    const event = createEvent({
      url: "https://on/capture-host",
      headers: { host: "EXAMPLE.com:3000" },
    });
    const rewrites = [
      {
        source: "/capture-host",
        destination: "/target?matched=:host",
        regex: "^/capture-host(?:/)?$",
        has: [{ type: "host" as const, value: "example\\.com" }],
      },
    ];

    const result = handleRewrites(event, rewrites);

    expect(result.internalEvent).toEqual({
      ...event,
      query: { matched: "example.com" },
      rawPath: "/target",
      url: "https://on/target?matched=example.com",
    });
    expect(result.__rewrite).toBe(rewrites[0]);
  });

  // Adapted from Next.js's value-less condition parameter regressions.
  // https://github.com/vercel/next.js/blob/ae745ba/test/e2e/custom-routes/custom-routes.test.ts#L1083-L1151
  it.each([
    {
      name: "header",
      event: { headers: { "x-tenant-123-id": "alpha" } },
      has: { type: "header", key: "X-Tenant-123-ID" },
      destination: "/target/:xtenantid",
      path: "/target/alpha",
      url: "https://on/target/alpha",
    },
    {
      name: "cookie",
      event: { cookies: { "session-id": "beta" } },
      has: { type: "cookie", key: "session-id" },
      destination: "/target/:sessionid",
      path: "/target/beta",
      url: "https://on/target/beta",
    },
    {
      name: "query",
      event: { url: "https://on/value-less?my-query=gamma" },
      has: { type: "query", key: "my-query" },
      destination: "/target/:myquery",
      path: "/target/gamma",
      url: "https://on/target/gamma?my-query=gamma",
    },
    {
      name: "repeated query",
      event: { url: "https://on/value-less?items=one&items=two" },
      has: { type: "query", key: "items" },
      destination: "/target/:items*",
      path: "/target/one/two",
      url: "https://on/target/one/two?items=one&items=two",
    },
  ] satisfies {
    name: string;
    event: PartialEvent;
    has: RouteHas;
    destination: string;
    path: string;
    url: string;
  }[])(
    "should expose a value-less $name condition",
    ({ event: partialEvent, has, destination, path, url }) => {
      const event = createEvent({
        url: "https://on/value-less",
        ...partialEvent,
      });
      const rewrites = [
        {
          source: "/value-less",
          destination,
          regex: "^/value-less(?:/)?$",
          has: [has],
        },
      ];

      const result = handleRewrites(event, rewrites);

      expect(result.internalEvent).toEqual({
        ...event,
        rawPath: path,
        url,
      });
      expect(result.__rewrite).toBe(rewrites[0]);
    },
  );

  it("should not expose a patterned condition without a capture group", () => {
    const event = createEvent({
      url: "https://on/value-less",
      headers: { "x-tenant-id": "alpha" },
    });

    expect(() =>
      handleRewrites(event, [
        {
          source: "/value-less",
          destination: "/target/:xtenantid",
          regex: "^/value-less(?:/)?$",
          has: [{ type: "header", key: "x-tenant-id", value: "alpha" }],
        },
      ]),
    ).toThrow('Expected "xtenantid" to be a string');
  });

  // Next.js uses successful `has` predicates to build parameters, while
  // nonmatching `missing` predicates contribute nothing.
  // https://github.com/vercel/next.js/blob/ae745ba/packages/next/src/shared/lib/router/utils/prepare-destination.ts#L92-L125
  it.each([
    { type: "header", key: "x-blocked", value: "(?<value>.*)" },
    { type: "cookie", key: "blocked", value: "(?<value>.*)" },
    { type: "query", key: "blocked", value: "(?<value>.*)" },
    { type: "host", value: "(?<value>.*)" },
  ] satisfies RouteHas[])(
    "should not let an absent $type condition overwrite a source parameter",
    (missing) => {
      const event = createEvent({ url: "https://on/source/from-source" });
      const rewrites = [
        {
          source: "/source/:value",
          destination: "/target/:value",
          regex: "^/source(?:/([^/]+?))(?:/)?$",
          missing: [missing],
        },
      ];

      const result = handleRewrites(event, rewrites);

      expect(result.internalEvent).toEqual({
        ...event,
        rawPath: "/target/from-source",
        url: "https://on/target/from-source",
      });
      expect(result.__rewrite).toBe(rewrites[0]);
    },
  );

  it("should not let a missing condition overwrite a has parameter", () => {
    const event = createEvent({
      url: "https://on/combined?tenant=alpha",
    });
    const rewrites = [
      {
        source: "/combined",
        destination: "/target/:value",
        regex: "^/combined(?:/)?$",
        has: [{ type: "query" as const, key: "tenant", value: "(?<value>.*)" }],
        missing: [
          { type: "query" as const, key: "blocked", value: "(?<value>.*)" },
        ],
      },
    ];

    const result = handleRewrites(event, rewrites);

    expect(result.internalEvent).toEqual({
      ...event,
      rawPath: "/target/alpha",
      url: "https://on/target/alpha?tenant=alpha",
    });
    expect(result.__rewrite).toBe(rewrites[0]);
  });

  it("should reject a rewrite when a missing condition matches", () => {
    const event = createEvent({ url: "https://on/blocked?blocked=true" });

    const result = handleRewrites(event, [
      {
        source: "/blocked",
        destination: "/unexpected",
        regex: "^/blocked(?:/)?$",
        missing: [{ type: "query", key: "blocked", value: "true" }],
      },
    ]);

    expect(result.internalEvent).toEqual(event);
    expect(result.__rewrite).toBeUndefined();
  });

  // Related upstream catch-all fixture and tests:
  // https://github.com/vercel/next.js/blob/ae745ba/test/e2e/custom-routes-catchall/next.config.js
  // https://github.com/vercel/next.js/blob/ae745ba/test/e2e/custom-routes-catchall/custom-routes-catchall.test.ts
  it("should rewrite an empty optional catch-all to the internal root", () => {
    const event = createEvent({
      url: "https://on/legacy",
    });
    const rewrites = [
      {
        source: "/legacy/:path*",
        destination: "/:path*",
        regex: "^/legacy(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?(?:/)?$",
      },
    ];

    const result = handleRewrites(event, rewrites);

    expect(result).toEqual({
      internalEvent: {
        ...event,
        rawPath: "/",
        url: "https://on/",
      },
      __rewrite: rewrites[0],
      isExternalRewrite: false,
    });
  });

  it("should rewrite without params", () => {
    const event = createEvent({
      url: "https://on/foo",
    });

    const rewrites = [
      {
        source: "foo",
        destination: "/bar",
        regex: "^/foo(?:/)?$",
      },
    ];
    const result = handleRewrites(event, rewrites);

    expect(result).toEqual({
      internalEvent: {
        ...event,
        rawPath: "/bar",
        url: "https://on/bar",
      },
      __rewrite: rewrites[0],
      isExternalRewrite: false,
    });
  });

  it("should rewrite externally", () => {
    const event = createEvent({
      url: "https://on/albums/foo/bar",
    });

    const rewrites = [
      {
        source: "/albums/:album/:song",
        destination: "https://external.com/search?album=:album&song=:song",
        regex: "^/albums(?:/([^/]+?))(?:/([^/]+?))(?:/)?$",
      },
    ];
    const result = handleRewrites(event, rewrites);

    expect(result).toEqual({
      internalEvent: {
        ...event,
        query: {
          album: "foo",
          song: "bar",
        },
        rawPath: "/search",
        url: "https://external.com/search?album=foo&song=bar",
      },
      __rewrite: rewrites[0],
      isExternalRewrite: true,
    });
  });

  it("should rewrite externally with a literal port", () => {
    const event = createEvent({
      url: "https://on/api/applications",
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: '{"name":"OpenNext"}',
    });

    const rewrites = [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:48952/api/:path*",
        regex: "^/api(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?(?:/)?$",
      },
    ];
    const result = handleRewrites(event, rewrites);

    expect(result).toEqual({
      internalEvent: {
        ...event,
        rawPath: "/api/applications",
        url: "http://127.0.0.1:48952/api/applications",
      },
      __rewrite: rewrites[0],
      isExternalRewrite: true,
    });
  });

  // For reference https://github.com/opennextjs/opennextjs-aws/issues/1217
  it("should rewrite to the root with a query string", () => {
    const event = createEvent({
      url: "https://on/promo/anything",
    });

    const rewrites = [
      {
        source: "/promo/:path*",
        destination: "/?ref=promo",
        regex: "^/promo(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?(?:/)?$",
      },
    ];
    const result = handleRewrites(event, rewrites);

    expect(result).toEqual({
      internalEvent: {
        ...event,
        query: { ref: "promo" },
        rawPath: "/",
        url: "https://on/?ref=promo",
      },
      __rewrite: rewrites[0],
      isExternalRewrite: false,
    });
  });

  // For reference https://github.com/opennextjs/opennextjs-aws/issues/1217
  it("should rewrite externally to a query string without a path", () => {
    const event = createEvent({
      url: "https://on/albums/foo",
    });

    const rewrites = [
      {
        source: "/albums/:album",
        destination: "https://external.com?album=:album",
        regex: "^/albums(?:/([^/]+?))(?:/)?$",
      },
    ];
    const result = handleRewrites(event, rewrites);

    expect(result).toEqual({
      internalEvent: {
        ...event,
        query: { album: "foo" },
        rawPath: "/",
        url: "https://external.com?album=foo",
      },
      __rewrite: rewrites[0],
      isExternalRewrite: true,
    });
  });

  it("should rewrite with matching path with has condition", () => {
    const event = createEvent({
      url: "https://on/albums/foo?has=true",
    });

    const rewrites = [
      {
        source: "/albums/:album",
        destination: "/rewrite/albums/:album",
        regex: "^/albums(?:/([^/]+?))(?:/)?$",
        has: [
          {
            type: "query",
            key: "has",
            value: "true",
          },
        ],
      },
    ];
    const result = handleRewrites(event, rewrites);

    expect(result).toEqual({
      internalEvent: {
        ...event,
        rawPath: "/rewrite/albums/foo",
        url: "https://on/rewrite/albums/foo?has=true",
      },
      __rewrite: rewrites[0],
      isExternalRewrite: false,
    });
  });

  it("should rewrite with matching path with missing condition", () => {
    const event = createEvent({
      url: "https://on/albums/foo",
      headers: {
        has: "true",
      },
    });

    const rewrites = [
      {
        source: "/albums/:album",
        destination: "/rewrite/albums/:album",
        regex: "^/albums(?:/([^/]+?))(?:/)?$",
        missing: [
          {
            type: "header",
            key: "missing",
          },
        ],
      },
    ];
    const result = handleRewrites(event, rewrites);

    expect(result).toEqual({
      internalEvent: {
        ...event,
        rawPath: "/rewrite/albums/foo",
        url: "https://on/rewrite/albums/foo",
      },
      __rewrite: rewrites[0],
      isExternalRewrite: false,
    });
  });
});

describe("fixDataPage", () => {
  it("should return 404 for data requests that don't match the buildId", () => {
    const event = createEvent({
      url: "https://on/_next/data/xyz/test",
    });

    const response = fixDataPage(event, "abc");

    expect(response.statusCode).toEqual(404);
  });

  it("should not return 404 for data requests that don't match the buildId", () => {
    const event = createEvent({
      url: "https://on/_next/data/abc/test",
    });

    const response = fixDataPage(event, "abc");

    expect(response.statusCode).not.toEqual(404);
    expect(response).toEqual(event);
  });

  it("should not return 404 for data requests (with base path) that don't match the buildId", () => {
    NextConfig.basePath = "/base";

    const event = createEvent({
      url: "https://on/base/_next/data/abc/test",
    });

    const response = fixDataPage(event, "abc");

    expect(response.statusCode).not.toEqual(404);
    expect(response).toEqual(event);

    NextConfig.basePath = undefined;
  });

  it("should remove json extension from data requests and add __nextDataReq to query", () => {
    const event = createEvent({
      url: "https://on/_next/data/abc/test/file.json?hello=world",
    });

    const response = fixDataPage(event, "abc");

    expect(response).toEqual({
      ...event,
      rawPath: "/test/file",
      url: "https://on/test/file?hello=world&__nextDataReq=1",
      headers: { "x-nextjs-data": "1" },
    });
  });

  it("should remove json extension from data requests (with base path) and add __nextDataReq to query", () => {
    const mockBasePath = "/base";
    NextConfig.basePath = mockBasePath;

    const event = createEvent({
      url: `https://on${mockBasePath}/_next/data/abc/test/file.json?hello=world`,
    });

    const response = fixDataPage(event, "abc");

    expect(response).toEqual({
      ...event,
      rawPath: `${mockBasePath}/test/file`,
      url: `https://on${mockBasePath}/test/file?hello=world&__nextDataReq=1`,
      headers: { "x-nextjs-data": "1" },
    });

    NextConfig.basePath = undefined;
  });
});
