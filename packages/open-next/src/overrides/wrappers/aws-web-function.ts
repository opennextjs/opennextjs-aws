import type { Wrapper } from "types/overrides";

import { error } from "../../adapters/logger";
import { createNodeServerWrapper } from "../../utils/node-server-wrapper";

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
 * How long shutdown waits for in-flight `waitUntil` work.
 *
 * After SIGTERM, Lambda terminates a Web Function execution environment within 1 second, so the drain is best
 * effort and must finish before that.
 */
const SHUTDOWN_DRAIN_TIMEOUT_MS = 800;

/**
 * Wrapper for AWS Lambda Web Functions.
 *
 * A Web Function runs a long-lived HTTP server that handles concurrent requests, so this is the `node` wrapper
 * (pair it with the `node` converter) with these differences:
 * - It binds the address Lambda provides in `AWS_LAMBDA_HTTP_ENDPOINT`.
 * - It provides `waitUntil`, so work deferred by the handler (e.g. sending a revalidation to SQS) is tracked and
 *   awaited instead of being dropped. The execution environment is not frozen between requests, so this work
 *   keeps running after the response, and shutdown waits for it, within the time Lambda allows after SIGTERM.
 */
export default createNodeServerWrapper({
  name: "aws-web-function",
  resolveAddress: resolveBindAddress,
  waitUntil: true,
  shutdownDrainTimeoutMs: SHUTDOWN_DRAIN_TIMEOUT_MS,
}) satisfies Wrapper;
