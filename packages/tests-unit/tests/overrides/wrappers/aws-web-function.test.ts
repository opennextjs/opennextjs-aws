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
        close: (callback?: () => void) => callback?.(),
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

  const signalHandlers = new Map<string, () => void>();

  beforeEach(() => {
    // The wrapper keeps module-level state, so every test needs a fresh module
    vi.resetModules();
    listeners.length = 0;
    listen.mockReset();
    signalHandlers.clear();
    vi.spyOn(process, "on").mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      signalHandlers.set(event, handler);
      return process;
    }) as never);
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

    it("answers 500 and keeps awaiting waitUntil work when the handler throws", async () => {
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
          throw new Error("boom");
        },
      );
      const listener = await startWrapper();
      const res = createResponse();

      await expect(
        listener(req as never, res as never),
      ).resolves.toBeUndefined();

      expect(res.writeHead).toHaveBeenCalledWith(500, {
        "Content-Type": "text/plain",
      });
      expect(res.end).toHaveBeenCalledWith("Internal Server Error");
      expect(deferredWorkDone).toBe(true);
    });

    it("answers 500 when the converter throws", async () => {
      const failingConverter = {
        convertFrom: async () => {
          throw new Error("bad request");
        },
      } as unknown as Converter;
      const { default: webFunctionWrapper } = await import(
        "@opennextjs/aws/overrides/wrappers/aws-web-function.js"
      );
      await webFunctionWrapper.wrapper(handler, failingConverter);
      const res = createResponse();

      await expect(
        listeners[0](req as never, res as never),
      ).resolves.toBeUndefined();

      expect(res.writeHead).toHaveBeenCalledWith(500, {
        "Content-Type": "text/plain",
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it("destroys the response when the handler throws after the headers were sent", async () => {
      handler.mockRejectedValue(new Error("boom"));
      const listener = await startWrapper();
      const res = Object.assign(createResponse(), {
        headersSent: true,
        destroy: vi.fn(),
      });

      await listener(req as never, res as never);

      expect(res.destroy).toHaveBeenCalledTimes(1);
      expect(res.writeHead).not.toHaveBeenCalled();
    });
  });

  describe("shutdown", () => {
    const req = { url: "/", method: "GET" };

    function createResponse() {
      return Object.assign(new EventEmitter(), {
        setHeader: vi.fn(),
        writeHead: vi.fn(),
        end: vi.fn(),
      });
    }

    function deferWork(promise: Promise<void>) {
      handler.mockImplementation(
        async (
          _event: unknown,
          { waitUntil }: { waitUntil: (promise: Promise<void>) => void },
        ) => {
          waitUntil(promise);
        },
      );
    }

    let exit: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("waits for waitUntil work of already-responded requests before exiting", async () => {
      let finishWork!: () => void;
      deferWork(new Promise<void>((resolve) => (finishWork = resolve)));
      const listener = await startWrapper();
      void listener(req as never, createResponse() as never);
      await new Promise((resolve) => setImmediate(resolve));

      signalHandlers.get("SIGTERM")?.();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(exit).not.toHaveBeenCalled();

      finishWork();
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    });

    it("exits after the drain timeout when work never settles", async () => {
      vi.useFakeTimers();
      deferWork(new Promise<void>(() => {}));
      const listener = await startWrapper();
      void listener(req as never, createResponse() as never);
      await vi.advanceTimersByTimeAsync(0);

      signalHandlers.get("SIGTERM")?.();
      await vi.advanceTimersByTimeAsync(799);
      expect(exit).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(exit).toHaveBeenCalledWith(0);
    });

    it("exits immediately when nothing is in flight", async () => {
      await startWrapper();

      signalHandlers.get("SIGINT")?.();

      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    });
  });
});
