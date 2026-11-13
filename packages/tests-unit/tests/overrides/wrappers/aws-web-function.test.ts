import { EventEmitter } from "node:events";
import type { RequestListener } from "node:http";

import type { StreamCreator } from "@opennextjs/aws/types/open-next.js";
import type { Converter } from "@opennextjs/aws/types/overrides.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listeners, listen } = vi.hoisted(() => ({
  listeners: [] as RequestListener[],
  listen: vi.fn(),
}));

// Capture the request listener and the listen arguments instead of binding a port
vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    createServer: vi.fn((listener: RequestListener) => {
      listeners.push(listener);
      const fakeServer = Object.assign(new EventEmitter(), {
        listen: (...args: unknown[]) => {
          listen(...args);
          fakeServer.emit("listening");
        },
        close: () => {},
      });
      return fakeServer;
    }),
  };
});

const converter = {
  convertFrom: async (req: { url: string; method: string }) => ({
    type: "core",
    rawPath: req.url,
    method: req.method,
  }),
} as unknown as Converter;

describe("wrappers/aws-web-function", () => {
  const handler = vi.fn();

  function expectListenedWith(...args: unknown[]) {
    expect(listen).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(...args);
  }

  async function startWrapper() {
    const { default: webFunctionWrapper } = await import(
      "@opennextjs/aws/overrides/wrappers/aws-web-function.js"
    );
    await webFunctionWrapper.wrapper(handler, converter);
    expect(listeners).toHaveLength(1);
    return listeners[0];
  }

  beforeEach(() => {
    listeners.length = 0;
    listen.mockReset();
    vi.spyOn(process, "on").mockImplementation(() => process);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    handler.mockReset();
  });

  describe("bind address", () => {
    it("binds the host and port in AWS_LAMBDA_HTTP_ENDPOINT", async () => {
      vi.stubEnv("AWS_LAMBDA_HTTP_ENDPOINT", "127.0.0.1:9001");
      vi.stubEnv("PORT", "4321");

      await startWrapper();

      expectListenedWith(9001, "127.0.0.1");
    });

    it("listens on PORT on all interfaces outside a Web Function", async () => {
      vi.stubEnv("AWS_LAMBDA_HTTP_ENDPOINT", "");
      vi.stubEnv("PORT", "4321");

      await startWrapper();

      expectListenedWith(4321);
    });

    it("defaults to port 3000", async () => {
      vi.stubEnv("AWS_LAMBDA_HTTP_ENDPOINT", "");
      vi.stubEnv("PORT", "");
      delete process.env.PORT;

      await startWrapper();

      expectListenedWith(3000);
    });

    it("falls back to PORT when AWS_LAMBDA_HTTP_ENDPOINT is not host:port", async () => {
      vi.stubEnv("AWS_LAMBDA_HTTP_ENDPOINT", "not-an-endpoint");
      vi.stubEnv("PORT", "4321");

      await startWrapper();

      expectListenedWith(4321);
    });
  });

  describe("request handling", () => {
    const req = { url: "/", method: "GET" };

    function createResponse() {
      return Object.assign(new EventEmitter(), {
        setHeader: vi.fn(),
        writeHead: vi.fn(),
        end: vi.fn(),
      });
    }

    it("answers /__health without calling the handler", async () => {
      const listener = await startWrapper();
      const res = createResponse();

      await listener(
        { url: "/__health", method: "GET" } as never,
        res as never,
      );

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "text/plain",
      });
      expect(res.end).toHaveBeenCalledWith("OK");
      expect(handler).not.toHaveBeenCalled();
    });

    it("awaits work registered with waitUntil", async () => {
      let deferredWorkDone = false;
      handler.mockImplementation(
        async (
          _event: unknown,
          { waitUntil }: { waitUntil: (promise: Promise<void>) => void },
        ) => {
          waitUntil(
            new Promise<void>((resolve) =>
              setTimeout(() => {
                deferredWorkDone = true;
                resolve();
              }, 10),
            ),
          );
        },
      );
      const listener = await startWrapper();

      await listener(req as never, createResponse() as never);

      expect(deferredWorkDone).toBe(true);
    });

    it("aborts the stream when the response closes", async () => {
      let streamCreator: StreamCreator | undefined;
      handler.mockImplementation(
        async (_event: unknown, options: { streamCreator: StreamCreator }) => {
          streamCreator = options.streamCreator;
        },
      );
      const listener = await startWrapper();
      const res = createResponse();

      await listener(req as never, res as never);
      expect(streamCreator?.abortSignal?.aborted).toBe(false);
      res.emit("close");

      expect(streamCreator?.abortSignal?.aborted).toBe(true);
    });
  });
});
