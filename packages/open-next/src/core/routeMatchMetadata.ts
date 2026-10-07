import { NextConfig } from "config/index.js";

import { warn } from "../adapters/logger.js";

/**
 * Returns the request metadata selecting `route` for `pathname`.
 *
 * Next.js 16.4 removed the route matcher manager from the base server: it now only renders the
 * most specific route matching the pathname, and `invokeOutput` can skip that route but no
 * longer selects another one. The Next.js router server forwards the route to render as a
 * `match` request metadata instead, which is required to retry the next route after a
 * `NoFallbackError` (i.e. a `fallback: false` page which was not prerendered).
 *
 * Next.js mutates the metadata of the previous attempt, which then contains the `match` of the
 * route which threw the `NoFallbackError`. `match` is always returned (possibly `undefined`) so
 * that it overrides this stale match even when the route can't be matched.
 *
 * Returns no metadata on older versions of Next.js, which still match routes from `invokeOutput`.
 */
export function getRouteMatchMetadata(
  nextServer: any,
  route: string,
  pathname: string,
): { match?: unknown } {
  if (!("getRouteDefinitions" in nextServer)) {
    return {};
  }
  // These are private Next.js internals, they might change in any release.
  if (
    typeof nextServer.getRoutePatternDefinition !== "function" ||
    typeof nextServer.testRouteDefinition !== "function"
  ) {
    warn(
      "Unable to match the route to retry after a NoFallbackError, the Next.js internals have changed.",
    );
    return { match: undefined };
  }
  const i18nProvider = nextServer.i18nProvider;
  // Route definitions don't include the basePath, the locale is handled by the i18n analysis.
  const basePath = NextConfig.basePath;
  const pathWithoutBasePath = !basePath
    ? pathname
    : pathname === basePath
      ? "/"
      : pathname.startsWith(`${basePath}/`)
        ? pathname.slice(basePath.length)
        : pathname;
  const normalizedPathname =
    pathWithoutBasePath !== "/" && pathWithoutBasePath.endsWith("/")
      ? pathWithoutBasePath.slice(0, -1)
      : pathWithoutBasePath;
  const pathnameLocaleAnalysis = i18nProvider?.analyze(normalizedPathname, {
    defaultLocale: NextConfig.i18n?.defaultLocale,
  });
  // Pages route definitions are per locale, the definition must be looked up with the locale of
  // the pathname or `testRouteDefinition` rejects it.
  const definition = nextServer.getRoutePatternDefinition(
    route,
    i18nProvider?.analyze(route, {
      defaultLocale: pathnameLocaleAnalysis?.detectedLocale,
    }),
  );
  if (!definition) {
    return { match: undefined };
  }
  return {
    match:
      nextServer.testRouteDefinition(
        normalizedPathname,
        definition,
        pathnameLocaleAnalysis,
      ) ?? undefined,
  };
}
