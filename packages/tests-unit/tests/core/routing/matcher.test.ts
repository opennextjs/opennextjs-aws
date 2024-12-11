import { NextConfig } from "@opennextjs/aws/adapters/config/index.js";
import {
  fixDataPage,
  getNextConfigHeaders,
  handleRedirects,
  handleRewrites,
} from "@opennextjs/aws/core/routing/matcher.js";
import { convertFromQueryString } from "@opennextjs/aws/core/routing/util.js";
import type { InternalEvent } from "@opennextjs/aws/types/open-next.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {},
}));
vi.mock("@opennextjs/aws/core/routing/i18n/index.js", () => ({
  localizePath: (event: InternalEvent) => event.rawPath,
}));

type PartialEvent = Partial<
  Omit<InternalEvent, "body" | "rawPath" | "query">
> & { body?: string };

function createEvent(event: PartialEvent): InternalEvent {
  const [rawPath, qs] = (event.url ?? "/").split("?", 2);
  return {
    type: "core",
    method: event.method ?? "GET",
    rawPath,
    url: event.url ?? "/",
    body: Buffer.from(event.body ?? ""),
    headers: event.headers ?? {},
    query: convertFromQueryString(qs ?? ""),
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
      url: "/",
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
      url: "/",
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
      url: "/hello-world",
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
      url: "/hello-world",
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

  it("should return request headers for matching /* route with missing condition", () => {
    const event = createEvent({
      url: "/hello-world",
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
      url: "/hello-world",
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

  it.todo(
    "should exercise the error scenario: 'Error matching header <key> with value <value>'",
  );
});

describe("handleRedirects", () => {
  it("should redirect trailing slash by default", () => {
    const event = createEvent({
      url: "/api-route/",
    });

    const result = handleRedirects(event, []);

    expect(result.statusCode).toEqual(308);
    expect(result.headers.Location).toEqual("/api-route");
  });

  it("should not redirect trailing slash when skipTrailingSlashRedirect is true", () => {
    const event = createEvent({
      url: "/api-route/",
    });

    NextConfig.skipTrailingSlashRedirect = true;
    const result = handleRedirects(event, []);

    expect(result).toBeUndefined();
  });

  it("should redirect matching path", () => {
    const event = createEvent({
      url: "/api-route",
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

    expect(result.headers.Location).toBe("/new/api-route");
  });

  it("should redirect matching nested path", () => {
    const event = createEvent({
      url: "/api-route/secret",
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

    expect(result.headers.Location).toBe("/new/api-route/secret");
  });

  it("should not redirect unmatched path", () => {
    const event = createEvent({
      url: "/api-route",
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
      url: "/foo",
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
      "/search?bar=hello+world&baz=new%2C+earth",
    );
  });
});

describe("handleRewrites", () => {
  it("should not rewrite with empty rewrites", () => {
    const event = createEvent({
      url: "/foo?hellp=world",
    });

    const result = handleRewrites(event, []);

    expect(result).toEqual({
      internalEvent: event,
      isExternalRewrite: false,
    });
  });

  it("should rewrite with params", () => {
    const event = createEvent({
      url: "/albums/foo/bar",
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
        url: "/rewrite/albums/foo/bar",
      },
      __rewrite: rewrites[1],
      isExternalRewrite: false,
    });
  });

  it("should rewrite without params", () => {
    const event = createEvent({
      url: "/foo",
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
        url: "/bar",
      },
      __rewrite: rewrites[0],
      isExternalRewrite: false,
    });
  });

  it("should rewrite externally", () => {
    const event = createEvent({
      url: "/albums/foo/bar",
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
        rawPath: "https://external.com/search",
        url: "https://external.com/search?album=foo&song=bar",
      },
      __rewrite: rewrites[0],
      isExternalRewrite: true,
    });
  });

  it("should rewrite with matching path with has condition", () => {
    const event = createEvent({
      url: "/albums/foo?has=true",
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
        url: "/rewrite/albums/foo?has=true",
      },
      __rewrite: rewrites[0],
      isExternalRewrite: false,
    });
  });

  it("should rewrite with matching path with missing condition", () => {
    const event = createEvent({
      url: "/albums/foo",
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
        url: "/rewrite/albums/foo",
      },
      __rewrite: rewrites[0],
      isExternalRewrite: false,
    });
  });
});

describe("fixDataPage", () => {
  it("should return 404 for data requests that don't match the buildId", () => {
    const event = createEvent({
      url: "/_next/data/xyz/test",
    });

    const response = fixDataPage(event, "abc");

    expect(response.statusCode).toEqual(404);
  });

  it("should not return 404 for data requests that don't match the buildId", () => {
    const event = createEvent({
      url: "/_next/data/abc/test",
    });

    const response = fixDataPage(event, "abc");

    expect(response.statusCode).not.toEqual(404);
    expect(response).toEqual(event);
  });

  it("should not return 404 for data requests (with base path) that don't match the buildId", () => {
    NextConfig.basePath = "/base";

    const event = createEvent({
      url: "/base/_next/data/abc/test",
    });

    const response = fixDataPage(event, "abc");

    expect(response.statusCode).not.toEqual(404);
    expect(response).toEqual(event);

    NextConfig.basePath = undefined;
  });

  it("should remove json extension from data requests and add __nextDataReq to query", () => {
    const event = createEvent({
      url: "/_next/data/abc/test/file.json?hello=world",
    });

    const response = fixDataPage(event, "abc");

    expect(response).toEqual({
      ...event,
      rawPath: "/test/file",
      url: "/test/file?hello=world&__nextDataReq=1",
    });
  });

  it("should remove json extension from data requests (with base path) and add __nextDataReq to query", () => {
    NextConfig.basePath = "/base";

    const event = createEvent({
      url: "/base/_next/data/abc/test/file.json?hello=world",
    });

    const response = fixDataPage(event, "abc");

    expect(response).toEqual({
      ...event,
      rawPath: "/test/file",
      url: "/test/file?hello=world&__nextDataReq=1",
    });

    NextConfig.basePath = undefined;
  });
});
