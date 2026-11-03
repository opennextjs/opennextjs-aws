import {
  type IncomingHttpHeaders,
  type RequestListener,
  type Server,
  createServer,
  request,
} from "node:http";
import type { Writable } from "node:stream";

import {
  MAX_VERIFIED_CONTENT_LENGTH,
  writeResponseHead,
} from "@opennextjs/aws/http/framing.js";

type Response = {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: string;
};

describe("writeResponseHead", () => {
  let server: Server;
  let port: number;
  let listener: RequestListener;

  beforeEach(async () => {
    server = createServer((req, res) => listener(req, res));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as { port: number }).port;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  /**
   * Sends a request to the test server.
   *
   * @param method The request method.
   * @param onResponse Called when the head of the response is received.
   * @returns The response.
   */
  function send(method = "GET", onResponse?: () => void): Promise<Response> {
    return new Promise((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port, method, path: "/" },
        (res) => {
          onResponse?.();
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              statusCode: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString(),
            }),
          );
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  /**
   * Responds to every request using `writeResponseHead()`.
   *
   * @param statusCode The response status code.
   * @param headers The response headers.
   * @param write Writes the body.
   */
  function respond(
    statusCode: number,
    headers: Record<string, string>,
    write: (body: Writable) => void | Promise<void>,
  ) {
    listener = (req, res) => {
      write(writeResponseHead(res, req.method, statusCode, headers));
    };
  }

  it("keeps a content-length matching the body", async () => {
    respond(
      200,
      { "content-type": "text/plain", "content-length": "5" },
      (body) => body.end("hello"),
    );

    const res = await send();

    expect(res.headers["content-length"]).toBe("5");
    expect(res.headers).not.toHaveProperty("transfer-encoding");
    expect(res.headers["content-type"]).toBe("text/plain");
    expect(res.body).toBe("hello");
  });

  it("keeps a content-length matching a body written in several chunks", async () => {
    respond(200, { "Content-Length": "11" }, (body) => {
      body.write("hello");
      body.write(" ");
      body.end("world");
    });

    const res = await send();

    expect(res.headers["content-length"]).toBe("11");
    expect(res.body).toBe("hello world");
  });

  it("removes a content-length smaller than the body", async () => {
    respond(200, { "content-length": "4" }, (body) => {
      body.write("body ");
      body.end("longer than the declared length");
    });

    const res = await send();

    expect(res.headers).not.toHaveProperty("content-length");
    expect(res.headers["transfer-encoding"]).toBe("chunked");
    expect(res.body).toBe("body longer than the declared length");
  });

  it("removes a content-length larger than the body", async () => {
    respond(200, { "content-length": "100" }, (body) => body.end("short"));

    const res = await send();

    expect(res.headers).not.toHaveProperty("content-length");
    expect(res.headers["transfer-encoding"]).toBe("chunked");
    expect(res.body).toBe("short");
  });

  it.each(["abc", "4, 4", "-1", "1.5", ""])(
    "removes an invalid content-length (%j)",
    async (contentLength) => {
      respond(200, { "content-length": contentLength }, (body) =>
        body.end("body"),
      );

      const res = await send();

      expect(res.headers).not.toHaveProperty("content-length");
      expect(res.body).toBe("body");
    },
  );

  it("does not verify a content-length larger than MAX_VERIFIED_CONTENT_LENGTH", async () => {
    let headReceived!: () => void;
    const head = new Promise<void>((resolve) => {
      headReceived = resolve;
    });
    respond(
      200,
      { "content-length": String(MAX_VERIFIED_CONTENT_LENGTH + 1) },
      async (body) => {
        body.write("first");
        // The head is sent before the body ends
        await head;
        body.end(" last");
      },
    );

    const res = await send("GET", headReceived);

    expect(res.headers).not.toHaveProperty("content-length");
    expect(res.headers["transfer-encoding"]).toBe("chunked");
    expect(res.body).toBe("first last");
  });

  it("streams a body without content-length", async () => {
    let headReceived!: () => void;
    const head = new Promise<void>((resolve) => {
      headReceived = resolve;
    });
    respond(200, { "content-type": "text/html" }, async (body) => {
      body.write("first");
      await head;
      body.end(" last");
    });

    const res = await send("GET", headReceived);

    expect(res.headers).not.toHaveProperty("content-length");
    expect(res.headers["transfer-encoding"]).toBe("chunked");
    expect(res.body).toBe("first last");
  });

  it("always removes transfer-encoding", async () => {
    respond(
      200,
      { "content-length": "4", "Transfer-Encoding": "gzip, chunked" },
      (body) => body.end("body"),
    );

    const res = await send();

    expect(res.headers).not.toHaveProperty("transfer-encoding");
    expect(res.headers["content-length"]).toBe("4");
    expect(res.body).toBe("body");
  });

  it("keeps the content-length of a HEAD response", async () => {
    respond(200, { "content-length": "1234" }, (body) => body.end());

    const res = await send("HEAD");

    expect(res.headers["content-length"]).toBe("1234");
    expect(res.body).toBe("");
  });

  it("keeps the content-length of a 304 response", async () => {
    respond(304, { "content-length": "1234", etag: '"abc"' }, (body) =>
      body.end(),
    );

    const res = await send();

    expect(res.statusCode).toBe(304);
    expect(res.headers["content-length"]).toBe("1234");
    expect(res.headers.etag).toBe('"abc"');
    expect(res.body).toBe("");
  });

  it.each(["abc", "-1", ""])(
    "removes an invalid content-length of a HEAD response (%j)",
    async (contentLength) => {
      respond(200, { "content-length": contentLength }, (body) => body.end());

      const res = await send("HEAD");

      expect(res.headers).not.toHaveProperty("content-length");
    },
  );

  describe("invalid response head", () => {
    let uncaught: unknown[];
    const onUncaught = (e: unknown) => uncaught.push(e);

    beforeEach(() => {
      uncaught = [];
      // Vitest reports uncaught exceptions as test failures, record them instead
      process.prependListener("uncaughtException", onUncaught);
    });

    afterEach(() => {
      process.off("uncaughtException", onUncaught);
    });

    /**
     * Responds with `writeResponseHead()` and a 500 when it throws, like Next.js does.
     *
     * @param statusCode The response status code.
     * @param headers The response headers.
     * @returns The errors thrown by `writeResponseHead()`.
     */
    function respondOrFail(
      statusCode: number,
      headers: Record<string, string>,
    ): unknown[] {
      const thrown: unknown[] = [];
      listener = (req, res) => {
        try {
          writeResponseHead(res, req.method, statusCode, headers).end("body");
        } catch (e) {
          thrown.push(e);
          res.statusCode = 500;
          res.end("error");
        }
      };
      return thrown;
    }

    it.each([
      [
        "an invalid header value",
        200,
        { "x-value": "a\nb" },
        "ERR_INVALID_CHAR",
      ],
      [
        "an invalid header name",
        200,
        { "x value": "a" },
        "ERR_INVALID_HTTP_TOKEN",
      ],
      ["a status code lower than 100", 99, {}, "ERR_HTTP_INVALID_STATUS_CODE"],
      [
        "a status code greater than 999",
        1000,
        {},
        "ERR_HTTP_INVALID_STATUS_CODE",
      ],
    ])("throws synchronously on %s", async (_, statusCode, headers, code) => {
      for (const contentLength of [undefined, "4"]) {
        const thrown = respondOrFail(
          statusCode,
          contentLength === undefined
            ? headers
            : { ...headers, "content-length": contentLength },
        );

        const res = await send();

        expect(thrown).toEqual([expect.objectContaining({ code })]);
        expect(res.statusCode).toBe(500);
        expect(res.body).toBe("error");
      }
      expect(uncaught).toEqual([]);
    });

    it("throws synchronously when the headers were already sent", async () => {
      const thrown: unknown[] = [];
      listener = (req, res) => {
        res.writeHead(200);
        try {
          writeResponseHead(res, req.method, 200, { "content-length": "4" });
        } catch (e) {
          thrown.push(e);
        }
        res.end("body");
      };

      const res = await send();

      expect(thrown).toEqual([
        expect.objectContaining({ code: "ERR_HTTP_HEADERS_SENT" }),
      ]);
      expect(res.body).toBe("body");
      expect(uncaught).toEqual([]);
    });

    it("destroys the response when the deferred head can not be written", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      listener = (req, res) => {
        const body = writeResponseHead(res, req.method, 200, {
          "content-length": "4",
        });
        // The head is written once the body is received
        res.writeHead(200);
        body.end("body");
      };

      await expect(send()).rejects.toThrow();
      expect(uncaught).toEqual([]);
      expect(console.error).toHaveBeenCalled();
      vi.restoreAllMocks();

      // The server is still up
      respond(200, { "content-length": "5" }, (body) => body.end("hello"));
      const res = await send();
      expect(res.body).toBe("hello");
    });
  });

  it("removes the content-length of a 204 response", async () => {
    respond(204, { "content-length": "0" }, (body) => body.end());

    const res = await send();

    expect(res.statusCode).toBe(204);
    expect(res.headers).not.toHaveProperty("content-length");
  });
});
