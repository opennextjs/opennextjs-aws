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
});
