import type { AsyncLocalStorage } from "node:async_hooks";
import type { OutgoingHttpHeaders } from "node:http";

import type {
  CDNInvalidationHandler,
  IncrementalCache,
  ProxyExternalRequest,
  Queue,
  TagCache,
} from "types/overrides";

import type { DetachedPromiseRunner } from "../utils/promise";
import type { OpenNextConfig } from "./open-next";

export interface RequestData {
  geo?: {
    city?: string;
    country?: string;
    region?: string;
    latitude?: string;
    longitude?: string;
  };
  headers: OutgoingHttpHeaders;
  ip?: string;
  method: string;
  nextConfig?: {
    basePath?: string;
    i18n?: any;
    trailingSlash?: boolean;
  };
  page?: {
    name?: string;
    params?: { [key: string]: string | string[] };
  };
  url: string;
  body?: ReadableStream<Uint8Array>;
  signal: AbortSignal;
}

interface Entries {
  [k: string]: {
    default: (props: { page: string; request: RequestData }) => Promise<{
      response: Response;
      waitUntil: Promise<void>;
    }>;
  };
}

export interface EdgeRoute {
  name: string;
  page: string;
  regex: string[];
}

interface OpenNextRequestContext {
  requestId: string;
  pendingPromiseRunner: DetachedPromiseRunner;
  isISRRevalidation?: boolean;
  mergeHeadersPriority?: "middleware" | "handler";
}

declare global {
  // Needed in the cache adapter
  /**
   * The cache adapter for incremental static regeneration.
   * Only available in main functions or in the external middleware with `enableCacheInterception` set to `true`.
   * Defined in `createMainHandler` or in `adapter/middleware.ts`.
   */
  var incrementalCache: IncrementalCache;
  /**
   * The cache adapter for the tag cache.
   * Only available in main functions, the initializationFunction or in the external middleware with `enableCacheInterception` set to `true`.
   * Defined in `createMainHandler` or in `adapter/middleware.ts`.
   */
  var tagCache: TagCache;
  /**
   * A boolean that indicates if the DynamoDB cache is disabled.
   * @deprecated This will be removed, use `globalThis.openNextConfig.dangerous?.disableTagCache` instead.
   * Defined in esbuild banner for the cache adapter.
   */
  var disableDynamoDBCache: boolean;
  /**
   * A boolean that indicates if the incremental cache is disabled.
   * @deprecated This will be removed, use `globalThis.openNextConfig.dangerous?.disableIncrementalCache` instead.
   * Defined in esbuild banner for the cache adapter.
   */
  var disableIncrementalCache: boolean;

  /**
   * An object that contains the last modified time of the pages.
   * Only available in main functions.
   * TODO: Integrate this directly in the AsyncLocalStorage context
   * Defined in `createMainHandler`.
   */
  var lastModified: Record<string, number>;

  /**
   * A boolean that indicates if Next is V15 or higher.
   * Only available in the cache adapter.
   * Defined in the esbuild banner for the cache adapter.
   */
  var isNextAfter15: boolean;

  /**
   * A boolean that indicates if the runtime is Edge.
   * Only available in `edge` runtime functions (i.e. external middleware or function with edge runtime).
   * Defined in the `edge-adapter.ts`.
   */
  var isEdgeRuntime: true;

  /**
   * A boolean that indicates if we are running in debug mode.
   * Available in all functions.
   * Defined in the esbuild banner.
   */
  var openNextDebug: boolean;

  /**
   * The fetch function that should be used to make requests during the execution of the function.
   * Used to bypass Next intercepting and caching the fetch calls. Only available in main functions.
   * Defined in the `server-adapter.ts` and in `adapters/middleware.ts`.
   */
  var internalFetch: typeof fetch;

  /**
   * The Open Next configuration object.
   * Available in all functions.
   * Defined in the `createMainHandler` or in the `createGenericHandler`.
   */
  var openNextConfig: Partial<OpenNextConfig>;

  /**
   * The name of the function that is currently being executed.
   * Only available in main functions.
   * Defined in the `createMainHandler`.
   */
  var fnName: string | undefined;
  /**
   * The unique identifier of the server.
   * Only available in main functions.
   * Defined in the `createMainHandler`.
   */
  var serverId: string;

  /**
   * The AsyncLocalStorage instance that is used to store the request context.
   * Only available in main, middleware and edge functions.
   * TODO: should be available everywhere in the future.
   * Defined in `requestHandler.ts`, `middleware.ts` and `edge-adapter.ts`.
   */
  var __openNextAls: AsyncLocalStorage<OpenNextRequestContext>;

  /**
   * The function that is used to run background tasks even after the response has been sent.
   * This one is defined by the wrapper function as most of them don't need or support this feature.
   * If not present, all the awaiting promises will be resolved before sending the response.
   */
  var openNextWaitUntil: ((promise: Promise<void>) => void) | undefined;

  /**
   * The entries object that contains the functions that are available in the function.
   * Only available in edge runtime functions.
   * Defined in the esbuild edge plugin.
   */
  var _ENTRIES: Entries;
  /**
   * The routes object that contains the routes that are available in the function.
   * Only available in edge runtime functions.
   * Defined in the esbuild edge plugin.
   */
  var _ROUTES: EdgeRoute[];
  /**
   * A map that is used in the edge runtime.
   * Only available in edge runtime functions.
   */
  var __storage__: Map<unknown, unknown>;
  /**
   * AsyncContext available globally in the edge runtime.
   * Only available in edge runtime functions.
   */
  var AsyncContext: any;
  /**
   * AsyncLocalStorage available globally in the edge runtime.
   * Only available in edge runtime functions.
   * Defined in createEdgeBundle.
   */
  // biome-ignore lint/suspicious/noRedeclare: This is only needed in the edge runtime
  var AsyncLocalStorage: any;

  /**
   * The version of the Open Next runtime.
   * Available everywhere.
   * Defined in the esbuild banner.
   */
  var openNextVersion: string;

  /**
   * The queue that is used to handle ISR revalidation requests.
   * Only available in main functions and in the external middleware with `enableCacheInterception` set to `true`.
   * Defined in `createMainHandler` or in `adapter/middleware.ts`.
   */
  var queue: Queue;

  /**
   * The function that is used when resolving external rewrite requests.
   * Only available in main functions
   * Defined in `createMainHandler`.
   */
  var proxyExternalRequest: ProxyExternalRequest;

  /**
   * The function that will be called when the CDN needs invalidating (either from `revalidateTag` or from `res.revalidate`)
   * Available in main functions
   * Defined in `createMainHandler`
   */
  var cdnInvalidationHandler: CDNInvalidationHandler;
}
