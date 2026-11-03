import { EventEmitter } from "node:events";
import type { RequestListener, Server } from "node:http";
import { connect } from "node:net";

import { OpenNextNodeResponse } from "@opennextjs/aws/http/openNextResponse.js";
import type { StreamCreator } from "@opennextjs/aws/types/open-next.js";
import type { Converter } from "@opennextjs/aws/types/overrides.js";
import { afterEach, beforeEach, vi } from "vitest";

const { listeners } = vi.hoisted(() => ({
  listeners: [] as RequestListener[],
}));

// Capture the request listener instead of listening on `PORT`
vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    createServer: vi.fn((listener: RequestListener) => {
      listeners.push(listener);
      const fakeServer = Object.assign(new EventEmitter(), {
        listen: () => fakeServer.emit("listening"),
        close: () => {},
      });
      return fakeServer;
    }),
  };
});

type RawResponse = {
  statusLine: string;
  headers: Record<string, string>;
  body: string;
};

/**
 * Parses raw HTTP/1.1 responses the way a client or proxy reusing the connection would.
 *
 * @param raw The bytes received on the socket.
 * @returns The parsed responses.
 * @throws When the bytes are not valid HTTP/1.1 responses.
 */
function parseRawResponses(raw: Buffer): RawResponse[] {
  const responses: RawResponse[] = [];
  let offset = 0;
  while (offset < raw.length) {
    const headEnd = raw.indexOf("\r\n\r\n", offset);
    if (headEnd === -1) {
      throw new Error(`Invalid response: ${raw.subarray(offset)}`);
    }
    const [statusLine, ...headerLines] = raw
      .subarray(offset, headEnd)
      .toString()
      .split("\r\n");
    if (!statusLine.startsWith("HTTP/1.1 ")) {
      throw new Error(`Invalid status line: ${statusLine}`);
    }
    const headers: Record<string, string> = {};
    for (const line of headerLines) {
      const index = line.indexOf(":");
      headers[line.slice(0, index).toLowerCase()] = line
        .slice(index + 1)
        .trim();
    }
    offset = headEnd + 4;
    let body: Buffer;
    if (headers["content-length"] !== undefined) {
      const length = Number(headers["content-length"]);
      body = raw.subarray(offset, offset + length);
      offset += length;
    } else if (headers["transfer-encoding"] === "chunked") {
      const chunks: Buffer[] = [];
      while (true) {
        const sizeEnd = raw.indexOf("\r\n", offset);
        const size = Number.parseInt(
          raw.subarray(offset, sizeEnd).toString(),
          16,
        );
        offset = sizeEnd + 2;
        if (size === 0) {
          offset += 2;
          break;
        }
        chunks.push(raw.subarray(offset, offset + size));
        offset += size + 2;
      }
      body = Buffer.concat(chunks);
    } else {
      body = raw.subarray(offset);
      offset = raw.length;
    }
    responses.push({ statusLine, headers, body: body.toString() });
  }
  return responses;
}

/**
 * Sends raw requests over a single connection and collects everything received.
 *
 * @param port The port of the server.
 * @param requests The raw requests, written at once.
 * @returns The bytes received until the server closes the connection.
 */
function sendRawRequests(port: number, requests: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect(port, "127.0.0.1", () => socket.write(requests));
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => resolve(Buffer.concat(chunks)));
    socket.on("error", reject);
  });
}

describe("wrappers/node", () => {
  let server: Server;
  let port: number;
  const handler = vi.fn();

  beforeEach(async () => {
    listeners.length = 0;
    vi.spyOn(process, "on").mockImplementation(() => process);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const { default: nodeWrapper } = await import(
      "@opennextjs/aws/overrides/wrappers/node.js"
    );
    const converter = {
      convertFrom: async (req: { url: string; method: string }) => ({
        type: "core",
        rawPath: req.url,
        method: req.method,
      }),
    } as unknown as Converter;
    await nodeWrapper.wrapper(handler, converter);
    expect(listeners).toHaveLength(1);

    const { createServer } =
      await vi.importActual<typeof import("node:http")>("node:http");
    server = createServer(listeners[0]);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as { port: number }).port;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    handler.mockReset();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it("lets Node frame the body when the headers contain a stale content-length", async () => {
    const longBody = "decoded body which is longer than the declared length";
    handler.mockImplementation(
      async (
        event: { rawPath: string },
        { streamCreator }: { streamCreator: StreamCreator },
      ) => {
        const res = new OpenNextNodeResponse(
          () => {},
          async () => {},
          streamCreator,
        );
        res.setHeader("content-type", "text/plain");
        if (event.rawPath === "/stale") {
          res.setHeader("content-length", "5");
          res.setHeader("set-cookie", ["a=1", "b=2"]);
          res.end(longBody);
        } else {
          res.end("second");
        }
      },
    );

    const raw = await sendRawRequests(
      port,
      "GET /stale HTTP/1.1\r\nHost: localhost\r\n\r\n" +
        "GET /next HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
    );
    const responses = parseRawResponses(raw);

    expect(responses).toHaveLength(2);
    expect(responses[0].statusLine).toBe("HTTP/1.1 200 OK");
    expect(responses[0].headers).not.toHaveProperty("content-length");
    expect(responses[0].headers["transfer-encoding"]).toBe("chunked");
    expect(responses[0].headers["content-type"]).toBe("text/plain");
    expect(raw.toString()).toContain("Set-Cookie: a=1\r\nSet-Cookie: b=2\r\n");
    expect(responses[0].body).toBe(longBody);
    expect(responses[1].statusLine).toBe("HTTP/1.1 200 OK");
    expect(responses[1].body).toBe("second");
  });

  it("keeps a content-length matching the body", async () => {
    handler.mockImplementation(
      async (
        _event: unknown,
        { streamCreator }: { streamCreator: StreamCreator },
      ) => {
        const res = new OpenNextNodeResponse(
          () => {},
          async () => {},
          streamCreator,
        );
        res.setHeader("content-type", "text/plain");
        res.setHeader("content-length", "5");
        res.end("hello");
      },
    );

    const raw = await sendRawRequests(
      port,
      "GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
    );
    const responses = parseRawResponses(raw);

    expect(responses).toHaveLength(1);
    expect(responses[0].headers["content-length"]).toBe("5");
    expect(responses[0].headers).not.toHaveProperty("transfer-encoding");
    expect(responses[0].body).toBe("hello");
  });

  it("throws to the handler on an invalid header with a content-length", async () => {
    const uncaught: unknown[] = [];
    const onUncaught = (e: unknown) => uncaught.push(e);
    process.prependListener("uncaughtException", onUncaught);
    const thrown: unknown[] = [];
    handler.mockImplementation(
      async (
        event: { rawPath: string },
        { streamCreator }: { streamCreator: StreamCreator },
      ) => {
        const res = new OpenNextNodeResponse(
          () => {},
          async () => {},
          streamCreator,
        );
        // Like a Pages API route setting a header from the query before `res.send()`
        res.setHeader("x-value", event.rawPath === "/invalid" ? "a\nb" : "ok");
        res.setHeader("content-length", "4");
        try {
          res.end("body");
        } catch (e) {
          thrown.push(e);
        }
      },
    );

    try {
      // The invalid response is never sent, the client gives up
      await Promise.race([
        sendRawRequests(
          port,
          "GET /invalid HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        ),
        new Promise((resolve) => setTimeout(resolve, 200)),
      ]);
      const raw = await sendRawRequests(
        port,
        "GET /valid HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
      );
      const responses = parseRawResponses(raw);

      expect(thrown).toEqual([
        expect.objectContaining({ code: "ERR_INVALID_CHAR" }),
      ]);
      expect(uncaught).toEqual([]);
      expect(responses).toHaveLength(1);
      expect(responses[0].headers["x-value"]).toBe("ok");
      expect(responses[0].headers["content-length"]).toBe("4");
      expect(responses[0].body).toBe("body");
    } finally {
      process.off("uncaughtException", onUncaught);
    }
  });
});
