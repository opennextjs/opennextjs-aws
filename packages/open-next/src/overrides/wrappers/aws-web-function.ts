import { createServer } from "node:http";

import { writeResponseHead } from "http/framing";
import type { StreamCreator, WaitUntil } from "types/open-next";
import type { Wrapper, WrapperHandler } from "types/overrides";

import { debug, error } from "../../adapters/logger";
import { DetachedPromiseRunner } from "../../utils/promise";

/**
 * Resolves the address the HTTP server must bind.
 *
 * Lambda Web Functions set `AWS_LAMBDA_HTTP_ENDPOINT` to `host:port` and route requests to that address. Outside
 * a Web Function (e.g. `node index.mjs` locally) it is unset, and the server listens on `PORT`, like the `node`
 * wrapper does.
 *
 * @returns The host and port to listen on. The host is undefined to listen on all interfaces.
 */
function resolveBindAddress(): { host?: string; port: number } {
  const endpoint = process.env.AWS_LAMBDA_HTTP_ENDPOINT;
  if (endpoint) {
    const separator = endpoint.lastIndexOf(":");
    const port = Number.parseInt(endpoint.slice(separator + 1), 10);
    if (separator > 0 && Number.isInteger(port)) {
      return { host: endpoint.slice(0, separator), port };
    }
    error(
      `Invalid AWS_LAMBDA_HTTP_ENDPOINT "${endpoint}", expected "host:port"`,
    );
  }
  return { port: Number.parseInt(process.env.PORT ?? "3000", 10) };
}

/**
 * Wrapper for AWS Lambda Web Functions.
 *
 * A Web Function runs a long-lived HTTP server that handles concurrent requests, so this is the `node` wrapper
 * (pair it with the `node` converter), including its `/__health` route, with two differences:
 * - It binds the address Lambda provides in `AWS_LAMBDA_HTTP_ENDPOINT`.
 * - It provides `waitUntil`, so work deferred by the handler (e.g. sending a revalidation to SQS) is tracked and
 *   awaited instead of being dropped.
 */
const wrapper: WrapperHandler = async (handler, converter) => {
  const { host, port } = resolveBindAddress();

  const server = createServer(async (req, res) => {
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

    const promiseRunner = new DetachedPromiseRunner();
    const waitUntil: WaitUntil = (promise) => promiseRunner.add(promise);

    try {
      await handler(internalEvent, { streamCreator, waitUntil });
    } finally {
      await promiseRunner.await();
    }
  });

  await new Promise<void>((resolve) => {
    server.on("listening", () => {
      const cleanup = (code: number) => {
        debug("Closing server");
        server.close(() => {
          debug("Server closed");
          process.exit(code);
        });
      };
      console.log(`Listening on ${host ? `${host}:${port}` : `port ${port}`}`);
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

export default {
  wrapper,
  name: "aws-web-function",
  supportStreaming: true,
} satisfies Wrapper;
