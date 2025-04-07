import {
  AppPathsManifestKeys,
  NextConfig,
  RoutesManifest,
} from "config/index.js";
// @ts-ignore
import NextServer from "next/dist/server/next-server.js";

import { debug, error } from "../adapters/logger.js";
import {
  applyOverride as applyNextjsRequireHooksOverride,
  overrideHooks as overrideNextjsRequireHooks,
} from "./require-hooks.js";

// WORKAROUND: Set `__NEXT_PRIVATE_PREBUNDLED_REACT` to use prebundled Reac
// See https://opennext.js.org/aws/v2/advanced/workaround#workaround-set-__next_private_prebundled_react-to-use-prebundled-react
// Step 1: Need to override the require hooks for React before Next.js server
//         overrides them with prebundled ones in the case of app dir
// Step 2: Import Next.js server
// Step 3: Apply the override after Next.js server is imported since the
//         override that Next.js does is done at import time

//#override requireHooks
overrideNextjsRequireHooks(NextConfig);
applyNextjsRequireHooksOverride();
//#endOverride
const cacheHandlerPath = require.resolve("./cache.cjs");
// @ts-ignore
const nextServer = new NextServer.default({
  //#override requestHandlerHost
  hostname: "localhost",
  port: 3000,
  //#endOverride
  conf: {
    ...NextConfig,
    // Next.js compression should be disabled because of a bug in the bundled
    // `compression` package — https://github.com/vercel/next.js/issues/11669
    compress: false,
    // By default, Next.js uses local disk to store ISR cache. We will use
    // our own cache handler to store the cache on S3.
    //#override stableIncrementalCache
    cacheHandler: cacheHandlerPath,
    cacheMaxMemorySize: 0, // We need to disable memory cache
    //#endOverride
    experimental: {
      ...NextConfig.experimental,
      // This uses the request.headers.host as the URL
      // https://github.com/vercel/next.js/blob/canary/packages/next/src/server/next-server.ts#L1749-L1754
      //#override trustHostHeader
      trustHostHeader: true,
      //#endOverride
      //#override experimentalIncrementalCacheHandler
      incrementalCacheHandlerPath: cacheHandlerPath,
      //#endOverride
    },
  },
  customServer: false,
  dev: false,
  dir: __dirname,
});

let routesLoaded = false;

globalThis.__next_route_preloader = async (stage) => {
  if (routesLoaded) {
    return;
  }
  const thisFunction = globalThis.fnName
    ? globalThis.openNextConfig.functions![globalThis.fnName]
    : globalThis.openNextConfig.default;
  const routePreloadingBehavior =
    thisFunction?.routePreloadingBehavior ?? "none";
  if (routePreloadingBehavior === "none") {
    routesLoaded = true;
    return;
  }
  if (!("unstable_preloadEntries" in nextServer)) {
    debug(
      "The current version of Next.js does not support route preloading. Skipping route preloading.",
    );
    routesLoaded = true;
    return;
  }
  if (stage === "waitUntil" && routePreloadingBehavior === "withWaitUntil") {
    // We need to access the waitUntil
    const waitUntil = globalThis.__openNextAls.getStore()?.waitUntil;
    if (!waitUntil) {
      error(
        "You've tried to use the 'withWaitUntil' route preloading behavior, but the 'waitUntil' function is not available.",
      );
      routesLoaded = true;
      return;
    }
    debug("Preloading entries with waitUntil");
    waitUntil?.(nextServer.unstable_preloadEntries());
    routesLoaded = true;
  } else if (
    (stage === "start" && routePreloadingBehavior === "onStart") ||
    (stage === "warmerEvent" && routePreloadingBehavior === "onWarmerEvent") ||
    stage === "onDemand"
  ) {
    const startTimestamp = Date.now();
    debug("Preloading entries");
    await nextServer.unstable_preloadEntries();
    debug("Preloading entries took", Date.now() - startTimestamp, "ms");
    routesLoaded = true;
  }
};
// `getRequestHandlerWithMetadata` is not available in older versions of Next.js
// It is required to for next 15.2 to pass metadata for page router data route
export const requestHandler = (metadata: Record<string, any>) =>
  "getRequestHandlerWithMetadata" in nextServer
    ? nextServer.getRequestHandlerWithMetadata(metadata)
    : nextServer.getRequestHandler();

//#override setNextjsPrebundledReact
export function setNextjsPrebundledReact(rawPath: string) {
  // WORKAROUND: Set `__NEXT_PRIVATE_PREBUNDLED_REACT` to use prebundled React
  // See https://opennext.js.org/aws/v2/advanced/workaround#workaround-set-__next_private_prebundled_react-to-use-prebundled-react

  const routes = [
    ...RoutesManifest.routes.static,
    ...RoutesManifest.routes.dynamic,
  ];

  const route = routes.find((route) =>
    new RegExp(route.regex).test(rawPath ?? ""),
  );

  const isApp = AppPathsManifestKeys.includes(route?.page ?? "");
  debug("setNextjsPrebundledReact", { url: rawPath, isApp, route });

  // app routes => use prebundled React
  if (isApp) {
    process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = NextConfig.experimental
      .serverActions
      ? "experimental"
      : "next";
    return;
  }

  // page routes => use node_modules React
  process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = undefined;
}
//#endOverride
