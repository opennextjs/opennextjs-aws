import { OpenNextNodeResponse } from "@opennextjs/aws/http/openNextResponse.js";
import { describe, expect, it } from "vitest";

describe("OpenNextNodeResponse statusCode preservation", () => {
  it("defaults statusCode to 200 when not set", () => {
    const res = new OpenNextNodeResponse(
      () => {},
      async () => {},
    );
    expect(res.statusCode).toBe(200);
  });

  it("allows setting statusCode before headers are sent", () => {
    const res = new OpenNextNodeResponse(
      () => {},
      async () => {},
    );
    res.statusCode = 304;
    expect(res.statusCode).toBe(304);
  });

  it("prevents statusCode from being overwritten after headers are flushed via res.end() (e.g. Next.js resetting statusCode)", () => {
    const res = new OpenNextNodeResponse(
      () => {},
      async () => {},
    );

    const originalStatus = res.statusCode; // 200
    res.statusCode = 304;
    res.end(); // triggers _flush -> flushHeaders -> headersSent = true

    expect(res.headersSent).toBe(true);
    expect(res.statusCode).toBe(304);

    // Simulate Next.js base-server pipeImpl: res.statusCode = originalStatus
    res.statusCode = originalStatus;

    // Must remain 304 because headers were already sent
    expect(res.statusCode).toBe(304);
  });

  it("prevents statusCode from being overwritten after flushHeaders()", () => {
    const res = new OpenNextNodeResponse(
      () => {},
      async () => {},
    );

    res.statusCode = 304;
    res.flushHeaders();

    expect(res.headersSent).toBe(true);
    expect(res.statusCode).toBe(304);

    res.statusCode = 200;
    expect(res.statusCode).toBe(304);
  });

  it("locks statusCode to 200 on flushHeaders() if not explicitly set", () => {
    const res = new OpenNextNodeResponse(
      () => {},
      async () => {},
    );

    res.flushHeaders();
    expect(res.headersSent).toBe(true);
    expect(res.statusCode).toBe(200);

    res.statusCode = 500;
    expect(res.statusCode).toBe(200);
  });

  it("handles writeHead with status 304", () => {
    const res = new OpenNextNodeResponse(
      () => {},
      async () => {},
    );

    res.writeHead(304, { ETag: '"test-etag"' });
    expect(res.headersSent).toBe(true);
    expect(res.statusCode).toBe(304);
    expect(res.getHeader("etag")).toBe('"test-etag"');

    // Attempted overwrite after writeHead
    res.statusCode = 200;
    expect(res.statusCode).toBe(304);
  });

  describe("statusCode restriction (RFC 9110: 100-599)", () => {
    it("allows valid status codes between 100 and 599", () => {
      const res = new OpenNextNodeResponse(
        () => {},
        async () => {},
      );

      for (const code of [100, 200, 204, 304, 400, 404, 500, 599]) {
        res.statusCode = code;
        expect(res.statusCode).toBe(code);
      }
    });

    it("ignores status codes outside the 100-599 range", () => {
      const res = new OpenNextNodeResponse(
        () => {},
        async () => {},
      );

      res.statusCode = 404;
      expect(res.statusCode).toBe(404);

      res.statusCode = 99;
      expect(res.statusCode).toBe(404);

      res.statusCode = 0;
      expect(res.statusCode).toBe(404);

      res.statusCode = -200;
      expect(res.statusCode).toBe(404);

      res.statusCode = 600;
      expect(res.statusCode).toBe(404);

      res.statusCode = 999;
      expect(res.statusCode).toBe(404);
    });

    it("ignores non-integer and invalid types", () => {
      const res = new OpenNextNodeResponse(
        () => {},
        async () => {},
      );

      res.statusCode = 200;
      expect(res.statusCode).toBe(200);

      res.statusCode = 200.5;
      expect(res.statusCode).toBe(200);

      res.statusCode = Number.NaN;
      expect(res.statusCode).toBe(200);

      res.statusCode = Number.POSITIVE_INFINITY;
      expect(res.statusCode).toBe(200);

      res.statusCode = undefined as unknown as number;
      expect(res.statusCode).toBe(200);

      res.statusCode = null as unknown as number;
      expect(res.statusCode).toBe(200);

      res.statusCode = "404" as unknown as number;
      expect(res.statusCode).toBe(200);
    });

    it("validates statusCode passed to constructor", () => {
      const validRes = new OpenNextNodeResponse(
        () => {},
        async () => {},
        undefined,
        undefined,
        403,
      );
      expect(validRes.statusCode).toBe(403);

      const invalidLowRes = new OpenNextNodeResponse(
        () => {},
        async () => {},
        undefined,
        undefined,
        99,
      );
      expect(invalidLowRes.statusCode).toBe(200);

      const invalidHighRes = new OpenNextNodeResponse(
        () => {},
        async () => {},
        undefined,
        undefined,
        600,
      );
      expect(invalidHighRes.statusCode).toBe(200);

      const invalidNaNRes = new OpenNextNodeResponse(
        () => {},
        async () => {},
        undefined,
        undefined,
        Number.NaN,
      );
      expect(invalidNaNRes.statusCode).toBe(200);
    });
  });
});
