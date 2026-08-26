import {
  NO_STORE_CACHE_CONTROL,
  fixCacheControlForError,
} from "@opennextjs/aws/utils/cacheControl.js";
import { vi } from "vitest";

describe("fixCacheControlForError", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([404, 500])("should set no-store for a %i", (statusCode) => {
    const headers: Record<string, string> = {
      "cache-control": "s-maxage=31536000",
    };

    fixCacheControlForError(headers, statusCode);

    expect(headers["cache-control"]).toBe(NO_STORE_CACHE_CONTROL);
  });

  it("should set the header when it is absent", () => {
    const headers: Record<string, string> = {};

    fixCacheControlForError(headers, 404);

    expect(headers["cache-control"]).toBe(NO_STORE_CACHE_CONTROL);
  });

  // Other error statuses are produced by the application, which owns their cache headers.
  it.each([200, 301, 400, 403, 410, 503])(
    "should leave a %i untouched",
    (statusCode) => {
      const headers: Record<string, string> = {
        "cache-control": "s-maxage=31536000",
      };

      fixCacheControlForError(headers, statusCode);

      expect(headers["cache-control"]).toBe("s-maxage=31536000");
    },
  );

  it("should not touch the other headers", () => {
    const headers: Record<string, string> = { etag: "abc" };

    fixCacheControlForError(headers, 404);

    expect(headers.etag).toBe("abc");
  });

  it("should be a no-op when OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS is true", () => {
    vi.stubEnv("OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS", "true");
    const headers: Record<string, string> = {
      "cache-control": "s-maxage=31536000",
    };

    fixCacheControlForError(headers, 404);

    expect(headers["cache-control"]).toBe("s-maxage=31536000");
  });

  it("should still apply when OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS is not exactly `true`", () => {
    vi.stubEnv("OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS", "1");
    const headers: Record<string, string> = {};

    fixCacheControlForError(headers, 404);

    expect(headers["cache-control"]).toBe(NO_STORE_CACHE_CONTROL);
  });
});
