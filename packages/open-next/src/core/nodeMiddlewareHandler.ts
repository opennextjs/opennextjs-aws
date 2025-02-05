import type { RequestData } from "types/global";

type EdgeRequest = Omit<RequestData, "page">;

// Do we need Buffer here?
import { Buffer } from "node:buffer";
globalThis.Buffer = Buffer;

// AsyncLocalStorage is needed to be defined globally
import { AsyncLocalStorage } from "node:async_hooks";
globalThis.AsyncLocalStorage = AsyncLocalStorage;

interface NodeMiddleware {
  default: (req: {
    handler: any;
    request: EdgeRequest;
    page: "middleware";
  }) => Promise<{
    response: Response;
    waitUntil: Promise<void>;
  }>;
  middleware: any;
}

let _module: NodeMiddleware | undefined;

export default async function middlewareHandler(
  request: EdgeRequest,
): Promise<Response> {
  if (!_module) {
    // We use await import here so that we are sure that it is loaded after AsyncLocalStorage is defined on globalThis
    // TODO: We will probably need to change this at build time when used in a monorepo (or if the location changes)
    //@ts-expect-error - This file should be bundled with esbuild
    _module = (await import("./.next/server/middleware.js")).default;
  }
  const adapterFn = _module!.default || _module;
  const result = await adapterFn({
    handler: _module!.middleware || _module,
    request: request,
    page: "middleware",
  });
  // Not sure if we should await it here or defer to the global als
  globalThis.__openNextAls
    .getStore()
    ?.pendingPromiseRunner.add(result.waitUntil);
  return result.response;
}
