import { NextConfig } from "config/index";
import {
  compile,
  Match,
  match,
  MatchFunction,
  PathFunction,
} from "path-to-regexp";
import type {
  Header,
  PrerenderManifest,
  RedirectDefinition,
  RewriteDefinition,
  RouteHas,
} from "types/next-types";
import { InternalEvent, InternalResult } from "types/open-next";

import { debug } from "../../adapters/logger";
import { localizePath } from "./i18n";
import {
  convertFromQueryString,
  convertToQueryString,
  escapeRegex,
  getUrlParts,
  isExternal,
  unescapeRegex,
} from "./util";

const routeHasMatcher =
  (
    headers: Record<string, string>,
    cookies: Record<string, string>,
    query: Record<string, string | string[]>,
  ) =>
  (redirect: RouteHas): boolean => {
    switch (redirect.type) {
      case "header":
        return (
          !!headers?.[redirect.key.toLowerCase()] &&
          new RegExp(redirect.value ?? "").test(
            headers[redirect.key.toLowerCase()] ?? "",
          )
        );
      case "cookie":
        return (
          !!cookies?.[redirect.key] &&
          new RegExp(redirect.value ?? "").test(cookies[redirect.key] ?? "")
        );
      case "query":
        return query[redirect.key] && Array.isArray(redirect.value)
          ? redirect.value.reduce(
              (prev, current) =>
                prev || new RegExp(current).test(query[redirect.key] as string),
              false,
            )
          : new RegExp(redirect.value ?? "").test(
              (query[redirect.key] as string | undefined) ?? "",
            );
      case "host":
        return (
          headers?.host !== "" &&
          new RegExp(redirect.value ?? "").test(headers.host)
        );
      default:
        return false;
    }
  };

function checkHas(
  matcher: ReturnType<typeof routeHasMatcher>,
  has?: RouteHas[],
  inverted = false,
) {
  return has
    ? has.reduce((acc, cur) => {
        if (acc === false) return false;
        return inverted ? !matcher(cur) : matcher(cur);
      }, true)
    : true;
}

const getParamsFromSource =
  (source: MatchFunction<object>) => (value: string) => {
    debug("value", value);
    const _match = source(value);
    return _match ? _match.params : {};
  };

const computeParamHas =
  (
    headers: Record<string, string>,
    cookies: Record<string, string>,
    query: Record<string, string | string[]>,
  ) =>
  (has: RouteHas): object => {
    if (!has.value) return {};
    const matcher = new RegExp(`^${has.value}$`);
    const fromSource = (value: string) => {
      const matches = value.match(matcher);
      return matches?.groups ?? {};
    };
    switch (has.type) {
      case "header":
        return fromSource(headers[has.key.toLowerCase()] ?? "");
      case "cookie":
        return fromSource(cookies[has.key] ?? "");
      case "query":
        return Array.isArray(query[has.key])
          ? fromSource((query[has.key] as string[]).join(","))
          : fromSource((query[has.key] as string) ?? "");
      case "host":
        return fromSource(headers.host ?? "");
    }
  };

function convertMatch(
  match: Match,
  toDestination: PathFunction,
  destination: string,
) {
  if (match) {
    const { params } = match;
    const isUsingParams = Object.keys(params).length > 0;
    if (isUsingParams) {
      return toDestination(params);
    } else {
      return destination;
    }
  } else {
    return destination;
  }
}

export function addNextConfigHeaders(
  event: InternalEvent,
  configHeaders?: Header[] | undefined,
) {
  const addedHeaders: Record<string, string | undefined> = {};

  if (!configHeaders) return addedHeaders;
  const { rawPath, headers, query, cookies } = event;
  const matcher = routeHasMatcher(headers, cookies, query);

  const requestHeaders: Record<string, string> = {};

  for (const { headers, has, missing, regex, source } of configHeaders) {
    if (
      new RegExp(regex).test(rawPath) &&
      checkHas(matcher, has) &&
      checkHas(matcher, missing, true)
    ) {
      const fromSource = match(source);
      const _match = fromSource(rawPath);
      headers.forEach((h) => {
        try {
          const key = convertMatch(_match, compile(h.key), h.key);
          const value = convertMatch(_match, compile(h.value), h.value);
          requestHeaders[key] = value;
        } catch {
          debug("Error matching header ", h.key, " with value ", h.value);
          requestHeaders[h.key] = h.value;
        }
      });
    }
  }
  return requestHeaders;
}

export function handleRewrites<T extends RewriteDefinition>(
  event: InternalEvent,
  rewrites: T[],
) {
  const { rawPath, headers, query, cookies } = event;
  const localizedRawPath = localizePath(event);
  const matcher = routeHasMatcher(headers, cookies, query);
  const computeHas = computeParamHas(headers, cookies, query);
  const rewrite = rewrites.find((route) => {
    const path = route.locale === false ? rawPath : localizedRawPath;
    return (
      new RegExp(route.regex).test(path) &&
      checkHas(matcher, route.has) &&
      checkHas(matcher, route.missing, true)
    );
  });
  let finalQuery = query;

  let rewrittenUrl = rawPath;
  const isExternalRewrite = isExternal(rewrite?.destination);
  debug("isExternalRewrite", isExternalRewrite);
  if (rewrite) {
    const { pathname, protocol, hostname, queryString } = getUrlParts(
      rewrite.destination,
      isExternalRewrite,
    );
    // We need to use a localized path if the rewrite is not locale specific
    const pathToUse = rewrite.locale === false ? rawPath : localizedRawPath;
    debug("urlParts", { pathname, protocol, hostname, queryString });
    const toDestinationPath = compile(escapeRegex(pathname ?? "") ?? "");
    const toDestinationHost = compile(escapeRegex(hostname ?? "") ?? "");
    const toDestinationQuery = compile(escapeRegex(queryString ?? "") ?? "");
    let params = {
      // params for the source
      ...getParamsFromSource(match(escapeRegex(rewrite?.source) ?? ""))(
        pathToUse,
      ),
      // params for the has
      ...rewrite.has?.reduce((acc, cur) => {
        return { ...acc, ...computeHas(cur) };
      }, {}),
      // params for the missing
      ...rewrite.missing?.reduce((acc, cur) => {
        return { ...acc, ...computeHas(cur) };
      }, {}),
    };
    const isUsingParams = Object.keys(params).length > 0;
    let rewrittenQuery = queryString;
    let rewrittenHost = hostname;
    let rewrittenPath = pathname;
    if (isUsingParams) {
      rewrittenPath = unescapeRegex(toDestinationPath(params));
      rewrittenHost = unescapeRegex(toDestinationHost(params));
      rewrittenQuery = unescapeRegex(toDestinationQuery(params));
    }
    rewrittenUrl = isExternalRewrite
      ? `${protocol}//${rewrittenHost}${rewrittenPath}`
      : `/${rewrittenPath}`;
    // Should we merge the query params or use only the ones from the rewrite?
    finalQuery = {
      ...query,
      ...convertFromQueryString(rewrittenQuery),
    };
    debug("rewrittenUrl", { rewrittenUrl, finalQuery, isUsingParams });
  }

  return {
    internalEvent: {
      ...event,
      rawPath: rewrittenUrl,
      url: `${rewrittenUrl}${convertToQueryString(finalQuery)}`,
    },
    __rewrite: rewrite,
    isExternalRewrite,
  };
}

function handleTrailingSlashRedirect(event: InternalEvent) {
  const url = new URL(event.url, "http://localhost");

  if (
    // Someone is trying to redirect to a different origin, let's not do that
    url.host !== "localhost" ||
    NextConfig.skipTrailingSlashRedirect ||
    // We should not apply trailing slash redirect to API routes
    event.rawPath.startsWith("/api/")
  ) {
    return false;
  }
  if (
    NextConfig.trailingSlash &&
    !event.headers["x-nextjs-data"] &&
    !event.rawPath.endsWith("/") &&
    !event.rawPath.match(/[\w-]+\.[\w]+$/g)
  ) {
    const headersLocation = event.url.split("?");
    return {
      type: event.type,
      statusCode: 308,
      headers: {
        Location: `${headersLocation[0]}/${
          headersLocation[1] ? `?${headersLocation[1]}` : ""
        }`,
      },
      body: "",
      isBase64Encoded: false,
    };
    // eslint-disable-next-line sonarjs/elseif-without-else
  } else if (
    !NextConfig.trailingSlash &&
    event.rawPath.endsWith("/") &&
    event.rawPath !== "/"
  ) {
    const headersLocation = event.url.split("?");
    return {
      type: event.type,
      statusCode: 308,
      headers: {
        Location: `${headersLocation[0].replace(/\/$/, "")}${
          headersLocation[1] ? `?${headersLocation[1]}` : ""
        }`,
      },
      body: "",
      isBase64Encoded: false,
    };
  } else return false;
}

export function handleRedirects(
  event: InternalEvent,
  redirects: RedirectDefinition[],
): InternalResult | undefined {
  const trailingSlashRedirect = handleTrailingSlashRedirect(event);
  if (trailingSlashRedirect) return trailingSlashRedirect;
  const { internalEvent, __rewrite } = handleRewrites(
    event,
    redirects.filter((r) => !r.internal),
  );
  if (__rewrite && !__rewrite.internal) {
    return {
      type: event.type,
      statusCode: __rewrite.statusCode ?? 308,
      headers: {
        Location: internalEvent.url,
      },
      body: "",
      isBase64Encoded: false,
    };
  }
}

export function fixDataPage(
  internalEvent: InternalEvent,
  buildId: string,
): InternalEvent | InternalResult {
  const { rawPath, query } = internalEvent;
  const dataPattern = `/_next/data/${buildId}`;
  // Return 404 for data requests that don't match the buildId
  if (rawPath.startsWith("/_next/data") && !rawPath.startsWith(dataPattern)) {
    return {
      type: internalEvent.type,
      statusCode: 404,
      body: "{}",
      headers: {
        "Content-Type": "application/json",
      },
      isBase64Encoded: false,
    };
  }

  if (rawPath.startsWith(dataPattern) && rawPath.endsWith(".json")) {
    let newPath = rawPath.replace(dataPattern, "").replace(/\.json$/, "");
    newPath = newPath === "/index" ? "/" : newPath;
    query.__nextDataReq = "1";

    return {
      ...internalEvent,
      rawPath: newPath,
      query,
      url: `${newPath}${convertToQueryString(query)}`,
    };
  }
  return internalEvent;
}

export function handleFallbackFalse(
  internalEvent: InternalEvent,
  prerenderManifest: PrerenderManifest,
): { event: InternalEvent; isISR: boolean } {
  const { rawPath } = internalEvent;
  const { dynamicRoutes, routes } = prerenderManifest;
  const routeFallback = Object.entries(dynamicRoutes)
    .filter(([, { fallback }]) => fallback === false)
    .some(([, { routeRegex }]) => {
      const routeRegexExp = new RegExp(routeRegex);
      return routeRegexExp.test(rawPath);
    });
  const locales = NextConfig.i18n?.locales;
  const routesAlreadyHaveLocale =
    (locales !== undefined && locales.includes(rawPath.split("/")[1])) ||
    // If we don't use locales, we don't need to add the default locale
    locales === undefined;
  const localizedPath = routesAlreadyHaveLocale
    ? rawPath
    : `/${NextConfig.i18n?.defaultLocale}${rawPath}`;
  const isPregenerated = Object.keys(routes).includes(localizedPath);
  if (routeFallback && !isPregenerated) {
    return {
      event: {
        ...internalEvent,
        rawPath: "/404",
        url: "/404",
        headers: {
          ...internalEvent.headers,
          "x-invoke-status": "404",
        },
      },
      isISR: false,
    };
  }

  return {
    event: internalEvent,
    isISR: routeFallback || isPregenerated,
  };
}
