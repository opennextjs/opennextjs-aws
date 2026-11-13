import { connect } from "node:net";

import { expect, test } from "@playwright/test";

/**
 * Sends a raw HTTP/1.1 request and returns everything received until the server closes the connection.
 *
 * @param url The URL to request.
 * @returns The raw response.
 */
function rawGet(url: URL): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect(Number(url.port), url.hostname, () =>
      socket.write(
        `GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: close\r\n\r\n`,
      ),
    );
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString()));
    socket.on("error", reject);
  });
}

// The paths end with a slash because the app uses `trailingSlash: true`
test.describe("Response framing", () => {
  // Only the `node` and `express-dev` wrappers write to a Node.js socket.
  // The deployed Lambda responses are framed by AWS.
  test.skip(
    ({ baseURL }) => !(baseURL ?? "").startsWith("http://localhost"),
    "Only runs on localhost",
  );

  test("A stale content-length is not written to the connection", async ({
    baseURL,
  }) => {
    const raw = await rawGet(new URL("/api/content-length/?stale", baseURL));
    const head = raw.slice(0, raw.indexOf("\r\n\r\n"));

    expect(head).toMatch(/^HTTP\/1\.1 200/);
    // Bytes past a stale content-length would be parsed as the next response on a reused connection
    expect(head).not.toMatch(/^content-length:/im);
    expect(head).toMatch(/^transfer-encoding: chunked$/im);
    expect(raw).toContain("the full body of the response");
  });

  test("A content-length matching the body is kept", async ({ baseURL }) => {
    const raw = await rawGet(new URL("/api/content-length/", baseURL));
    const separator = raw.indexOf("\r\n\r\n");
    const head = raw.slice(0, separator);

    expect(head).toMatch(/^HTTP\/1\.1 200/);
    // CloudFront only compresses responses with a content-length
    expect(head).toMatch(/^content-length: 29$/im);
    expect(head).not.toMatch(/^transfer-encoding:/im);
    expect(raw.slice(separator + 4)).toBe("the full body of the response");
  });

  test("An invalid header with a content-length does not crash the server", async ({
    request,
  }) => {
    // `res.send()` sets a content-length, the invalid header must not throw outside of the request
    await request
      .get("/api/header/?invalid", { timeout: 2000 })
      .catch(() => {});

    const res = await request.get("/api/header/");
    expect(res.status()).toBe(200);
    expect(res.headers()["x-value"]).toBe("ok");
    expect(res.headers()["content-length"]).toBe("4");
    expect(await res.text()).toBe("body");
  });
});
