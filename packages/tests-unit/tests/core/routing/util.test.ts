/* eslint-disable sonarjs/no-duplicate-string */
import * as config from "@opennextjs/aws/adapters/config/index.js";
import { NextConfig } from "@opennextjs/aws/adapters/config/index.js";
import {
  addOpenNextHeader,
  constructNextUrl,
  convertBodyToReadableStream,
  convertFromQueryString,
  convertRes,
  convertToQuery,
  convertToQueryString,
  escapeRegex,
  fixCacheHeaderForHtmlPages,
  fixISRHeaders,
  fixSWRCacheHeader,
  getMiddlewareMatch,
  getUrlParts,
  invalidateCDNOnRequest,
  isExternal,
  revalidateIfRequired,
  unescapeRegex,
} from "@opennextjs/aws/core/routing/util.js";
import { fromReadableStream } from "@opennextjs/aws/utils/stream.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {
    basePath: "",
  },
  HtmlPages: [],
}));

declare global {
  var __openNextAls: any;
  var lastModified: any;
  var openNextDebug: boolean;
  var openNextVersion: string;
  var cdnInvalidationHandler: any;
}

type Res = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

function createResponse(res: Partial<Res>) {
  return {
    statusCode: res.statusCode,
    getFixedHeaders: () => res.headers ?? {},
    body: res.body ?? "",
    getBody: () => Buffer.from(res.body ?? ""),
  };
}

describe("isExternal", () => {
  it("returns false for empty arguments", () => {
    expect(isExternal()).toBe(false);
  });

  it("returns false for relative path", () => {
    expect(isExternal("/relative", "localhost")).toBe(false);
  });

  it("returns true for absolute http url without host", () => {
    expect(isExternal("http://absolute.com/path")).toBe(true);
  });

  it("returns true for absolute https url without host", () => {
    expect(isExternal("https://absolute.com/path")).toBe(true);
  });

  it("returns true for absolute http url different host", () => {
    expect(isExternal("http://absolute.com/path", "local.com")).toBe(true);
  });

  it("returns true for absolute https url different host", () => {
    expect(isExternal("https://absolute.com/path", "local.com")).toBe(true);
  });

  it("returns false for absolute http url same host", () => {
    expect(isExternal("http://absolute.com/path", "absolute.com")).toBe(false);
  });

  it("returns false for absolute https url same host", () => {
    expect(isExternal("https://absolute.com/path", "absolute.com")).toBe(false);
  });
});

describe("convertFromQueryString", () => {
  it("converts empty string to empty object", () => {
    expect(convertFromQueryString("")).toEqual({});
  });

  it("converts query string with no value", () => {
    expect(convertFromQueryString("search")).toEqual({ search: undefined });
  });

  it("converts query string with a value", () => {
    expect(convertFromQueryString("search=value")).toEqual({ search: "value" });
  });

  it("converts query string with multiple keys", () => {
    expect(convertFromQueryString("search=value&name=jo")).toEqual({
      search: "value",
      name: "jo",
    });
  });

  it("converts query string with multiple keys", () => {
    expect(convertFromQueryString("search=value&search=other")).toEqual({
      search: ["value", "other"],
    });
  });
});

describe("getUrlParts", () => {
  describe("relative", () => {
    it("returns url parts for empty string", () => {
      expect(getUrlParts("", false)).toEqual({
        hostname: "",
        pathname: "",
        protocol: "",
        queryString: "",
      });
    });

    it("returns url parts for /", () => {
      expect(getUrlParts("/", false)).toEqual({
        hostname: "",
        pathname: "/",
        protocol: "",
        queryString: "",
      });
    });

    it("returns url parts", () => {
      expect(getUrlParts("/relative", false)).toEqual({
        hostname: "",
        pathname: "/relative",
        protocol: "",
        queryString: "",
      });
    });

    it("returns url parts with query string", () => {
      expect(getUrlParts("/relative/path?query=1", false)).toEqual({
        hostname: "",
        pathname: "/relative/path",
        protocol: "",
        queryString: "query=1",
      });
    });
  });

  describe("external", () => {
    it("throws for empty url", () => {
      expect(() => getUrlParts("", true)).toThrow();
    });

    it("throws for invalid url", () => {
      expect(() => getUrlParts("/relative", true)).toThrow();
    });

    it("returns url parts for /", () => {
      expect(getUrlParts("http://localhost/", true)).toEqual({
        hostname: "localhost",
        pathname: "/",
        protocol: "http:",
        queryString: "",
      });
    });

    // For reference https://github.com/opennextjs/opennextjs-aws/issues/591
    it("returns url parts for / without trailing slash", () => {
      expect(getUrlParts("http://localhost", true)).toEqual({
        hostname: "localhost",
        pathname: "",
        protocol: "http:",
        queryString: "",
      });
    });

    it("returns url parts", () => {
      expect(getUrlParts("https://localhost/relative", true)).toEqual({
        hostname: "localhost",
        pathname: "/relative",
        protocol: "https:",
        queryString: "",
      });
    });

    it("returns url parts with query string", () => {
      expect(
        getUrlParts("http://localhost:3000/relative/path?query=1", true),
      ).toEqual({
        hostname: "localhost:3000",
        pathname: "/relative/path",
        protocol: "http:",
        queryString: "query=1",
      });
    });
  });
});

describe("convertRes", () => {
  it("convert a response with headers", async () => {
    const res = createResponse({
      statusCode: 400,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ hello: "world" }),
    });

    const result = convertRes(res);

    expect(result).toEqual(
      expect.objectContaining({
        type: "core",
        statusCode: 400,
        headers: {
          "content-type": "application/json",
        },
        isBase64Encoded: false,
      }),
    );
    expect(await fromReadableStream(result.body)).toEqual(
      res.getBody().toString(),
    );
  });

  it("convert a response with default status code", async () => {
    const res = createResponse({
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ hello: "world" }),
    });

    const result = convertRes(res);

    expect(result).toEqual(
      expect.objectContaining({
        type: "core",
        statusCode: 200,
        headers: {
          "content-type": "application/json",
        },
        isBase64Encoded: false,
      }),
    );
    expect(await fromReadableStream(result.body)).toEqual(
      res.getBody().toString(),
    );
  });

  it("convert a response with base64 encoding", async () => {
    const res = createResponse({
      headers: {
        "content-type": "application/octet-stream",
      },
      body: Buffer.from(JSON.stringify({ hello: "world" })).toString("base64"),
    });

    const result = convertRes(res);

    expect(result).toEqual(
      expect.objectContaining({
        type: "core",
        statusCode: 200,
        headers: {
          "content-type": "application/octet-stream",
        },
        isBase64Encoded: true,
      }),
    );
    expect(await fromReadableStream(result.body)).toEqual(
      res.getBody().toString(),
    );
  });
});

describe("convertToQueryString", () => {
  it("returns an empty string for no queries", () => {
    const query = {};
    expect(convertToQueryString(query)).toBe("");
  });

  it("converts a single entry to one querystring parameter", () => {
    const query = { key: "value" };
    expect(convertToQueryString(query)).toBe("?key=value");
  });

  it("converts multiple distinct entries to a querystring parameter each", () => {
    const query = { key: "value", another: "value2" };
    expect(convertToQueryString(query)).toBe("?key=value&another=value2");
  });

  it("converts multi-value parameters to multiple key value pairs", () => {
    const query = { key: ["value1", "value2"] };
    expect(convertToQueryString(query)).toBe("?key=value1&key=value2");
  });

  it("converts mixed multi-value and single value parameters", () => {
    const query = { key: ["value1", "value2"], another: "value3" };
    expect(convertToQueryString(query)).toBe(
      "?key=value1&key=value2&another=value3",
    );
  });

  it("should respect existing query encoding", () => {
    const query = {
      key: ["value%201", "value2+something+else"],
      another: "value3",
    };
    expect(convertToQueryString(query)).toBe(
      "?key=value%201&key=value2+something+else&another=value3",
    );
  });
});

describe("convertToQuery", () => {
  it("returns an empty object for empty string", () => {
    const querystring = "";
    expect(convertToQuery(querystring)).toEqual({});
  });

  it("converts a single querystring parameter to one query entry", () => {
    const querystring = "key=value";
    expect(convertToQuery(querystring)).toEqual({ key: "value" });
  });

  it("converts multiple distinct entries to an entry in the query", () => {
    const querystring = "key=value&another=value2";
    expect(convertToQuery(querystring)).toEqual({
      key: "value",
      another: "value2",
    });
  });

  it("converts multi-value parameters to an array in the query", () => {
    const querystring = "key=value1&key=value2";
    expect(convertToQuery(querystring)).toEqual({
      key: ["value1", "value2"],
    });
  });

  it("converts mixed multi-value and single value parameters", () => {
    const querystring = "key=value1&another=value2&key=value3";
    expect(convertToQuery(querystring)).toEqual({
      key: ["value1", "value3"],
      another: "value2",
    });
  });
});

describe("getMiddlewareMatch", () => {
  it("returns an empty list when root route not matched", () => {
    expect(getMiddlewareMatch({ middleware: {} })).toEqual([]);
  });

  it("returns an empty list when root matchers are empty", () => {
    expect(
      getMiddlewareMatch({
        middleware: {
          "/": {
            matchers: [],
          },
        },
      }),
    ).toEqual([]);
  });

  it("returns a list of regular expressions for each matcher on the root", () => {
    expect(
      getMiddlewareMatch({
        middleware: {
          "/": {
            matchers: [{ regexp: "/" }, { regexp: "/path" }],
          },
        },
      }),
    ).toEqual([/\//, /\/path/]);
  });
});

describe("regex", () => {
  describe("escapeRegex", () => {
    it.each([
      ["/a/(.)b", "/a/_µ1_b"],
      ["/a/(..)b", "/a/_µ2_b"],
      ["/a/b/(..)(..)c", "/a/b/_µ2__µ2_c"],
      ["/a/(...)b", "/a/_µ3_b"],
      ["/feed/(..)photo/[id]", "/feed/_µ2_photo/[id]"],
      ["?something=a+b", "?something=a_µ4_b"],
    ])(
      "should escape (.), (..), (...), + with _µ1_, _µ2_, _µ3_, _µ4_ - %s",
      (input, expected) => {
        const result = escapeRegex(input);
        expect(result).toBe(expected);
      },
    );

    it("should not escape plus for a path", () => {
      expect(escapeRegex("/:path+", { isPath: true })).toBe("/:path+");
    });
  });

  describe("unescapeRegex", () => {
    it.each([
      ["/a/_µ1_b", "/a/(.)b"],
      ["/a/_µ2_b", "/a/(..)b"],
      ["/a/b/_µ2__µ2_c", "/a/b/(..)(..)c"],
      ["/a/_µ3_b", "/a/(...)b"],
      ["/feed/_µ2_photo/[id]", "/feed/(..)photo/[id]"],
      ["?something=a_µ4_b", "?something=a+b"],
    ])(
      "should unescape _µ1_, _µ2_, _µ3_ with (.), (..), (...) - %s",
      (input, expected) => {
        const result = unescapeRegex(input);
        expect(result).toBe(expected);
      },
    );
  });

  it.each([
    "/a/(.)b",
    "/a/(..)b",
    "/a/b/(..)(..)b",
    "/a/(...)b",
    "/a/(....)b",
    "/some/path",
    "/some/file.json",
  ])("should escape and unescape %s", (input) => {
    const escaped = escapeRegex(input);
    const unescaped = unescapeRegex(escaped);
    expect(unescaped).toBe(input);
  });
});

describe("convertBodyToReadableStream", () => {
  it("returns undefined for GET requests", () => {
    const result = convertBodyToReadableStream("GET");
    expect(result).toEqual(undefined);
  });

  it("returns undefined for HEAD requests", () => {
    const result = convertBodyToReadableStream("HEAD");
    expect(result).toEqual(undefined);
  });

  it("returns undefined when body is undefined", () => {
    const result = convertBodyToReadableStream("POST");
    expect(result).toEqual(undefined);
  });

  it("returns readable stream for when body is provided", async () => {
    const result = convertBodyToReadableStream("PUT", Buffer.from("body"));
    expect(await fromReadableStream(result as any)).toEqual("body");
  });
});

describe.skip("proxyRequest won't be tested as it is better suited for e2e tests", () => {});

describe("fixCacheHeaderForHtmlPages", () => {
  beforeEach(() => {
    config.HtmlPages.splice(0, config.HtmlPages.length);
  });

  it("should set cache-control header for /404 page", () => {
    const headers: Record<string, string> = {};
    fixCacheHeaderForHtmlPages(
      {
        rawPath: "/404",
      },
      headers,
    );

    expect(headers["cache-control"]).toBe(
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
  });

  it("should set cache-control header for /500 page", () => {
    const headers: Record<string, string> = {};
    fixCacheHeaderForHtmlPages(
      {
        rawPath: "/500",
      },
      headers,
    );

    expect(headers["cache-control"]).toBe(
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
  });

  it("should set cache-control header for html page", () => {
    const headers: Record<string, string> = {};
    config.HtmlPages.push("/my-html-page");

    fixCacheHeaderForHtmlPages(
      {
        rawPath: "/my-html-page",
        headers: {},
      },
      headers,
    );

    expect(headers["cache-control"]).toBe(
      "public, max-age=0, s-maxage=31536000, must-revalidate",
    );
  });

  it("should not add cache-control header for html page but with an `x-middleware-prefetch` header", () => {
    const headers: Record<string, string> = {};
    config.HtmlPages.push("/my-html-page");

    fixCacheHeaderForHtmlPages(
      {
        rawPath: "/my-html-page",
        headers: {
          "x-middleware-prefetch": "1",
        },
      },
      headers,
    );

    expect(headers).not.toHaveProperty("cache-control");
  });

  it("should not add cache-control header for non html page", () => {
    const headers: Record<string, string> = {};

    fixCacheHeaderForHtmlPages("/not-html-page", headers);

    expect(headers).not.toHaveProperty("cache-control");
  });

  it("should add cache-control header for html page with default i18n", () => {
    const headers: Record<string, string> = {};
    config.HtmlPages.push("/en/my-html-page");
    config.NextConfig.i18n = {
      defaultLocale: "en",
      locales: ["en", "fr"],
    };

    fixCacheHeaderForHtmlPages(
      {
        rawPath: "/my-html-page",
        cookies: {},
        headers: {},
      },
      headers,
    );

    expect(headers["cache-control"]).toBe(
      "public, max-age=0, s-maxage=31536000, must-revalidate",
    );

    config.NextConfig.i18n = undefined;
  });

  it("should add cache-control header for html page with locale", () => {
    const headers: Record<string, string> = {};
    config.HtmlPages.push("/en/my-html-page");
    config.HtmlPages.push("/fr/my-html-page");

    fixCacheHeaderForHtmlPages(
      {
        rawPath: "/en/my-html-page",
        cookies: {},
        headers: {
          "accept-language": "fr",
        },
      },
      headers,
    );

    expect(headers["cache-control"]).toBe(
      "public, max-age=0, s-maxage=31536000, must-revalidate",
    );
  });
});

describe("fixSWRCacheHeader", () => {
  it("should do nothing when cache-control header is undefined", () => {
    const headers: Record<string, string> = {};
    fixSWRCacheHeader(headers);

    expect(headers).toEqual({});
  });

  it("should replace incorrect stale-while-revalidate directive", () => {
    const headers: Record<string, string> = {
      "cache-control": "stale-while-revalidate",
    };
    fixSWRCacheHeader(headers);

    expect(headers).toEqual({
      "cache-control": "stale-while-revalidate=2592000",
    });
  });

  it("should replace incorrect stale-while-revalidate directive across multiple headers", () => {
    const headers: Record<string, string | string[]> = {
      "cache-control": ["max-age=0", "stale-while-revalidate"],
    };
    fixSWRCacheHeader(headers);

    expect(headers).toEqual({
      "cache-control": "max-age=0,stale-while-revalidate=2592000",
    });
  });

  it("should not replace correctly set stale-while-revalidate directive", () => {
    const headers: Record<string, string> = {
      "cache-control": "stale-while-revalidate=123",
    };
    fixSWRCacheHeader(headers);

    expect(headers).toEqual({
      "cache-control": "stale-while-revalidate=123",
    });
  });
});

describe("addOpenNextHeader", () => {
  beforeEach(() => {
    delete config.NextConfig.poweredByHeader;
    globalThis.openNextDebug = false;
    globalThis.openNextVersion = "1.0.0";
    globalThis.__openNextAls = {
      getStore: () => ({
        requestId: "123",
      }),
    };
  });

  it("should add OpenNext header when poweredByHeader is enabled", () => {
    const headers: Record<string, string> = {};
    config.NextConfig.poweredByHeader = true;

    addOpenNextHeader(headers);

    expect(headers["X-OpenNext"]).toBe("1");
  });

  it("should not add OpenNext header when poweredByHeader is undefined", () => {
    const headers: Record<string, string> = {};
    addOpenNextHeader(headers);
    expect(headers["X-OpenNext"]).toBeUndefined();
  });

  it("should add OpenNext debug headers when openNextDebug is enabled", () => {
    const headers: Record<string, string> = {};

    globalThis.openNextDebug = true;

    addOpenNextHeader(headers);

    expect(headers["X-OpenNext-Version"]).toBe("1.0.0");
    expect(headers["X-OpenNext-RequestId"]).toBe("123");
  });

  it("should not add OpenNext debug headers when openNextDebug is disabled", () => {
    const headers: Record<string, string> = {};

    addOpenNextHeader(headers);

    expect(headers).not.toHaveProperty("X-OpenNext-Version");
    expect(headers).not.toHaveProperty("X-OpenNext-RequestId");
  });
});

describe("revalidateIfRequired", () => {
  const sendMock = vi.fn();

  beforeEach(() => {
    globalThis.queue = {
      send: sendMock,
      name: "mock",
    };

    globalThis.__openNextAls = {
      getStore: vi.fn(),
    };
  });

  it("should not send to queue when x-nextjs-cache is not present", async () => {
    const headers: Record<string, string> = {};
    await revalidateIfRequired("localhost", "/path", headers);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should send to queue when x-nextjs-cache is STALE", async () => {
    const headers: Record<string, string> = {
      "x-nextjs-cache": "STALE",
    };
    await revalidateIfRequired("localhost", "/path", headers);

    expect(sendMock).toHaveBeenCalledWith({
      MessageBody: {
        host: "localhost",
        url: "/path",
        eTag: expect.any(String),
        lastModified: expect.any(Number),
      },
      MessageDeduplicationId: expect.any(String),
      MessageGroupId: expect.any(String),
    });
  });

  it("should not throw when send fails", async () => {
    const headers: Record<string, string> = {
      "x-nextjs-cache": "STALE",
    };
    sendMock.mockRejectedValueOnce(new Error("Failed to send"));
    await revalidateIfRequired("localhost", "/path", headers);

    expect(sendMock).toHaveBeenCalledWith({
      MessageBody: {
        host: "localhost",
        url: "/path",
        eTag: expect.any(String),
        lastModified: expect.any(Number),
      },
      MessageDeduplicationId: expect.any(String),
      MessageGroupId: expect.any(String),
    });
  });
});

describe("fixISRHeaders", () => {
  beforeEach(() => {
    vi.useFakeTimers().setSystemTime("2024-01-02T00:00:00Z");
    globalThis.__openNextAls = {
      getStore: () => ({
        lastModified: new Date("2024-01-01T12:00:00Z").getTime(),
      }),
    };
  });

  it("should set cache-control directive to must-revalidate when x-nextjs-cache is REVALIDATED", () => {
    const headers: Record<string, string> = {
      "x-nextjs-cache": "REVALIDATED",
    };
    fixISRHeaders(headers);

    expect(headers["cache-control"]).toBe(
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
  });

  it("should set cache-control directive to stale-while-revalidate when x-nextjs-cache is HIT", () => {
    const headers: Record<string, string> = {
      "cache-control": "s-maxage=86400", // 1 day
      "x-nextjs-cache": "HIT",
    };
    fixISRHeaders(headers);

    expect(headers["cache-control"]).toBe(
      "s-maxage=43200, stale-while-revalidate=2592000", // 12 hours due to time remaining
    );
  });

  it("should set cache-control directive to stale-while-revalidate when x-nextjs-cache is STALE", () => {
    const headers: Record<string, string> = {
      "x-nextjs-cache": "STALE",
    };
    fixISRHeaders(headers);

    expect(headers["cache-control"]).toBe(
      "s-maxage=2, stale-while-revalidate=2592000",
    );
  });
});

describe("invalidateCDNOnRequest", () => {
  beforeEach(() => {
    globalThis.cdnInvalidationHandler = {
      invalidatePaths: vi.fn(),
    };
  });

  it("should not call invalidatePaths when x-nextjs-cache is not REVALIDATED", async () => {
    const headers: Record<string, string> = {
      "x-nextjs-cache": "HIT",
    };
    await invalidateCDNOnRequest(
      {
        internalEvent: {
          headers: {},
        },
        initialURL: "http://localhost/path",
      },
      headers,
    );

    expect(
      globalThis.cdnInvalidationHandler.invalidatePaths,
    ).not.toHaveBeenCalled();
  });

  it("should not call invalidatePaths when x-nextjs-cache is REVALIDATED but on ISR request", async () => {
    const headers: Record<string, string> = {
      "x-nextjs-cache": "REVALIDATED",
    };
    await invalidateCDNOnRequest(
      {
        internalEvent: {
          rawPath: "/path",
          headers: {
            "x-isr": "1",
          },
        },
        initialURL: "http://localhost/path",
      },
      headers,
    );

    expect(
      globalThis.cdnInvalidationHandler.invalidatePaths,
    ).not.toHaveBeenCalled();
  });

  it("should call invalidatePaths when x-nextjs-cache is REVALIDATED", async () => {
    const headers: Record<string, string> = {
      "x-nextjs-cache": "REVALIDATED",
    };
    await invalidateCDNOnRequest(
      {
        internalEvent: {
          rawPath: "/path",
          headers: {},
        },
        resolvedRoutes: [
          {
            type: "app",
            route: "/path",
          },
        ],
        initialURL: "http://localhost/path",
      },
      headers,
    );

    expect(
      globalThis.cdnInvalidationHandler.invalidatePaths,
    ).toHaveBeenCalledWith([
      {
        initialPath: "/path",
        rawPath: "/path",
        resolvedRoutes: [
          {
            type: "app",
            route: "/path",
          },
        ],
      },
    ]);
  });
});

describe("constructNextUrl", () => {
  it("should construct next url without a basePath", () => {
    const result = constructNextUrl("http://localhost", "/path");
    expect(result).toBe("http://localhost/path");
  });

  it("should construct next url with a basePath", () => {
    vi.spyOn(NextConfig, "basePath", "get").mockReturnValue("/base");
    const result = constructNextUrl("http://localhost", "/path");
    expect(result).toBe("http://localhost/base/path");
  });
});
