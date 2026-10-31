import { AppPathRoutesManifest } from "config/index";
import type { ResolvedRoute } from "types/open-next";
import { NEXTJS_CACHE_HEADER } from "utils/cacheHeaders";
import { RequestCache } from "utils/requestCache";

import { debug, error } from "../adapters/logger";
import {
  dynamicRouteMatcher,
  staticRouteMatcher,
} from "./routing/routeMatcher";

/**
 * Arguments passed by Next to the router server `revalidate` function.
 *
 * Next renamed `revalidateHeaders` to `headers` in 16.x.
 */
export interface RevalidateArgs {
  urlPath: string;
  headers?: Record<string, string | string[] | undefined>;
  revalidateHeaders?: Record<string, string | string[] | undefined>;
  opts: { unstable_onlyGenerated?: boolean };
}

export type RevalidateFn = (args: RevalidateArgs) => Promise<void>;

/**
 * Timeout of the request revalidating a page served by another function.
 */
const REMOTE_REVALIDATE_TIMEOUT_MS = 30_000;

/**
 * Resolve the route of a path.
 *
 * Static routes take precedence over dynamic routes, as in Next.
 *
 * @param urlPath The path passed to `res.revalidate()`, may include the basePath and a locale
 * @returns The resolved route or `undefined` when no route matches
 */
export function resolveRoute(urlPath: string): ResolvedRoute | undefined {
  const pathname = urlPath.split(/[?#]/)[0];
  return staticRouteMatcher(pathname)[0] ?? dynamicRouteMatcher(pathname)[0];
}

/**
 * Convert a resolved route to the format used in `functions[name].routes` of the OpenNext config.
 *
 * i.e. `pages/index`, `pages/blog/[slug]`, `app/page`, `app/blog/[slug]/page`, ...
 *
 * @param route The resolved route
 * @returns The candidate route templates (app routes may have several because of route groups)
 */
export function getRouteTemplates(route: ResolvedRoute): string[] {
  if (route.type === "page") {
    return [`pages${route.route === "/" ? "/index" : route.route}`];
  }
  return Object.entries(AppPathRoutesManifest)
    .filter(([, path]) => path === route.route)
    .map(([appPath]) => `app${appPath}`);
}

/**
 * Returns whether the route is served by the current function.
 *
 * Routes that are not listed in any split function are served by the default function.
 * Paths that do not match any route are considered local so that Next handles them.
 *
 * @param route The resolved route
 * @returns `true` when the route is served by the current function
 */
export function isServedByCurrentFunction(
  route: ResolvedRoute | undefined,
): boolean {
  const functions = globalThis.openNextConfig?.functions ?? {};
  if (!route || Object.keys(functions).length === 0) {
    return true;
  }
  const templates = getRouteTemplates(route);
  const owner = Object.entries(functions).find(([, fn]) =>
    fn.routes?.some((r) => templates.includes(r)),
  )?.[0];
  // `globalThis.fnName` is `undefined` in the default function
  return owner === (globalThis.fnName || undefined);
}

/**
 * Revalidate a page served by another function by sending a `HEAD` request to the app.
 *
 * Only the revalidate headers provided by Next are forwarded (no cookies).
 * The function serving the page takes care of the CDN invalidation.
 *
 * TODO: the host comes from the request headers, use a trusted origin instead.
 *
 * @param args The arguments passed by Next to `revalidate`
 * @throws When the host is unknown or the page has not been revalidated
 */
export async function revalidateRemote({
  urlPath,
  headers,
  revalidateHeaders,
  opts,
}: RevalidateArgs): Promise<void> {
  const host = globalThis.__openNextAls.getStore()?.host;
  if (!host) {
    throw new Error(`Unable to revalidate ${urlPath}: unknown host`);
  }

  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(
    headers ?? revalidateHeaders ?? {},
  )) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      requestHeaders.append(key, v);
    }
  }

  const url = `https://${host}${urlPath}`;
  debug("Revalidating page served by another function", { url });
  const res = await globalThis.internalFetch(url, {
    method: "HEAD",
    headers: requestHeaders,
    redirect: "manual",
    signal: AbortSignal.timeout(REMOTE_REVALIDATE_TIMEOUT_MS),
  });

  // Same check as Next, see `NextNodeServer#revalidate`
  if (
    res.headers.get(NEXTJS_CACHE_HEADER)?.toUpperCase() !== "REVALIDATED" &&
    res.status !== 200 &&
    !(res.status === 404 && opts.unstable_onlyGenerated)
  ) {
    throw new Error(`Invalid response ${res.status}`);
  }
}

/**
 * Wrap `NextNodeServer#revalidate` used by `res.revalidate()` in the Pages Router API routes.
 *
 * - Pages served by the current function are revalidated in-process, then invalidated in the CDN.
 * - Pages served by another split function are revalidated with a `HEAD` request.
 *
 * `NextNodeServer#revalidate` is exposed to `res.revalidate()` by a build time patch,
 * see `exposeRevalidateRule` in `build/patch/patches/patchNextServer.ts`.
 *
 * @param revalidateInProcess The original `NextNodeServer#revalidate`
 * @returns The wrapped revalidate function
 */
export function createRevalidate(
  revalidateInProcess: RevalidateFn,
): RevalidateFn {
  return async (args) => {
    const route = resolveRoute(args.urlPath);
    if (!isServedByCurrentFunction(route)) {
      return revalidateRemote(args);
    }

    // Render the page in a context isolated from the API route request
    // so that per-request state (i.e. `lastModified`, request cache) does not leak.
    // The promise runner and `waitUntil` are shared to keep background work alive.
    const store = globalThis.__openNextAls.getStore();
    const renderInProcess = () => revalidateInProcess(args);
    // Throws when the page has not been revalidated
    await (store
      ? globalThis.__openNextAls.run(
          {
            ...store,
            lastModified: undefined,
            writtenTags: new Set<string>(),
            requestCache: new RequestCache(),
          },
          renderInProcess,
        )
      : renderInProcess());

    const path = args.urlPath.split(/[?#]/)[0];
    try {
      await globalThis.cdnInvalidationHandler?.invalidatePaths([
        {
          initialPath: path,
          rawPath: path,
          resolvedRoutes: route ? [route] : [{ route: path, type: "page" }],
        },
      ]);
    } catch (e) {
      // The page has been revalidated, only the CDN may serve stale content
      error(`Failed to invalidate ${path} in the CDN`, e);
    }
  };
}
