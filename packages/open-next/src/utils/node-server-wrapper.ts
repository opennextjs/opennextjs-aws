import { createServer } from "node:http";

import { writeResponseHead } from "http/framing";
import type { StreamCreator, WaitUntil } from "types/open-next";
import type { Wrapper, WrapperHandler } from "types/overrides";

import { debug, error } from "../adapters/logger";
import { DetachedPromiseRunner } from "./promise";

export type NodeServerWrapperOptions = {
  /** The name of the wrapper override. */
  name: string;
  /**
   * Resolves the address the HTTP server must bind.
   *
   * @returns The port to listen on, and the host. The host is undefined to listen on all interfaces.
   */
  resolveAddress: () => { host?: string; port: number };
  /** Whether the handler gets a `waitUntil` that is awaited after the response, and drained on shutdown. */
  waitUntil: boolean;
  /**
   * The maximum time shutdown waits for the server to close and for in-flight `waitUntil` work, before exiting.
   * Without it, shutdown waits for as long as it takes.
   */
  shutdownDrainTimeoutMs?: number;
};

/**
 * Creates a wrapper that serves the handler from a Node HTTP server.
 *
 * - `/__health` answers 200 without calling the handler.
 * - A failing request is answered with a 500 (or its response destroyed once headers were sent), instead of the
 *   rejection taking down the process and every concurrent request.
 * - With `waitUntil`, deferred work runs after the response and is awaited on shutdown.
 *
 * @param options The wrapper name, how it binds, and how it shuts down.
 * @returns The wrapper override.
 */
export function createNodeServerWrapper({
  name,
  resolveAddress,
  waitUntil: provideWaitUntil,
  shutdownDrainTimeoutMs,
}: NodeServerWrapperOptions): Wrapper {
  const wrapper: WrapperHandler = async (handler, converter) => {
    const { host, port } = resolveAddress();

    // Requests whose `waitUntil` work has not settled yet, drained on shutdown
    const inFlightRunners = new Set<DetachedPromiseRunner>();

    const server = createServer(async (req, res) => {
      const promiseRunner = new DetachedPromiseRunner();
      inFlightRunners.add(promiseRunner);

      try {
        const internalEvent = await converter.convertFrom(req);

        if (internalEvent.rawPath === "/__health") {
          res.writeHead(200, {
            "Content-Type": "text/plain",
          });
          res.end("OK");
          return;
        }

        const abortController = new AbortController();

        const streamCreator: StreamCreator = {
          writeHeaders: (prelude) => {
            res.setHeader("Set-Cookie", prelude.cookies);
            return writeResponseHead(
              res,
              req.method,
              prelude.statusCode,
              prelude.headers,
            );
          },
          abortSignal: abortController.signal,
        };

        res.on("close", () => {
          abortController.abort();
        });

        const waitUntil: WaitUntil | undefined = provideWaitUntil
          ? (promise) => promiseRunner.add(promise)
          : undefined;

        await handler(internalEvent, { streamCreator, waitUntil });
      } catch (e) {
        error("Failed to handle request", e);
        if (res.headersSent) {
          res.destroy();
        } else {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Internal Server Error");
        }
      } finally {
        await promiseRunner.await();
        inFlightRunners.delete(promiseRunner);
      }
    });

    await new Promise<void>((resolve) => {
      server.on("listening", () => {
        const cleanup = (code: number) => {
          debug("Closing server");
          const serverClosed = new Promise<void>((done) => {
            server.close(() => done());
          });
          const workDrained = Promise.allSettled(
            [...inFlightRunners].map((runner) => runner.await()),
          );
          const drained = Promise.all([serverClosed, workDrained]);
          const closing =
            shutdownDrainTimeoutMs === undefined
              ? drained
              : Promise.race([
                  drained,
                  new Promise<void>((done) => {
                    setTimeout(done, shutdownDrainTimeoutMs);
                  }),
                ]);
          closing.then(() => {
            debug("Server closed");
            process.exit(code);
          });
        };
        console.log(
          `Listening on ${host ? `${host}:${port}` : `port ${port}`}`,
        );
        debug(`Open Next version: ${process.env.OPEN_NEXT_VERSION}`);

        process.on("exit", (code) => cleanup(code));

        process.on("SIGINT", () => cleanup(0));
        process.on("SIGTERM", () => cleanup(0));

        resolve();
      });

      if (host) {
        server.listen(port, host);
      } else {
        server.listen(port);
      }
    });

    server.on("error", (err) => {
      error(err);
    });

    return () => {
      server.close();
    };
  };

  return { wrapper, name, supportStreaming: true };
}
