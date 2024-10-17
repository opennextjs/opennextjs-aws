import { NextConfig } from "@opennextjs/aws/adapters/config/index.js";
import {
  addNextConfigHeaders,
  handleRedirects,
} from "@opennextjs/aws/core/routing/matcher.js";
import { convertFromQueryString } from "@opennextjs/aws/core/routing/util.js";
import { InternalEvent } from "@opennextjs/aws/types/open-next.js";
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
  const [rawPath, qs] = (event.url ?? "/").split("?", 1);
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

describe("addNextConfigHeaders", () => {
  it("should return empty object for undefined configHeaders", () => {
    const event = createEvent({});
    const result = addNextConfigHeaders(event);

    expect(result).toEqual({});
  });

  it("should return empty object for empty configHeaders", () => {
    const event = createEvent({});
    const result = addNextConfigHeaders(event, []);

    expect(result).toEqual({});
  });

  it("should return request headers for matching / route", () => {
    const event = createEvent({
      url: "/",
    });

    const result = addNextConfigHeaders(event, [
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

    const result = addNextConfigHeaders(event, [
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

    const result = addNextConfigHeaders(event, [
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

    const result = addNextConfigHeaders(event, [
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

    const result = addNextConfigHeaders(event, [
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

    const result = addNextConfigHeaders(event, [
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
        internal: true,
        statusCode: 308,
        regex: "^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))/$",
      },
    ]);

    expect(result).toBeUndefined();
  });

  it("should not redirect unmatched path", () => {
    const event = createEvent({
      url: "/api-route",
    });

    const result = handleRedirects(event, [
      {
        source: "/foo/",
        destination: "/bar",
        internal: true,
        statusCode: 308,
        regex: "^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))/$",
      },
    ]);

    expect(result).toBeUndefined();
  });
});
