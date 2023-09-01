import { compile, Match, match, PathFunction } from "path-to-regexp";

import { InternalEvent, InternalResult } from "../event-mapper";
import { debug } from "../logger";
import {
  Header,
  RedirectDefinition,
  RewriteDefinition,
  RouteHas,
} from "../next-types";
import { escapeRegex, unescapeRegex } from "../util";
import { convertQuery, getUrlParts, isExternal } from "./util";

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
          headers?.[redirect.key.toLowerCase()] !== "" &&
          new RegExp(redirect.value ?? "").test(
            headers[redirect.key.toLowerCase()] ?? "",
          )
        );
      case "cookie":
        return (
          cookies?.[redirect.key] !== "" &&
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
        const key = convertMatch(_match, compile(h.key), h.key);
        const value = convertMatch(_match, compile(h.value), h.value);
        requestHeaders[key] = value;
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
  const matcher = routeHasMatcher(headers, cookies, query);
  const rewrite = rewrites.find(
    (route) =>
      new RegExp(route.regex).test(rawPath) &&
      checkHas(matcher, route.has) &&
      checkHas(matcher, route.missing, true),
  );

  const urlQueryString = new URLSearchParams(convertQuery(query)).toString();
  let rewrittenUrl = rawPath;
  const isExternalRewrite = isExternal(rewrite?.destination);
  debug("isExternalRewrite", isExternalRewrite);
  if (rewrite) {
    const { pathname, protocol, hostname } = getUrlParts(
      rewrite.destination,
      isExternalRewrite,
    );
    const toDestination = compile(escapeRegex(pathname ?? "") ?? "");
    const fromSource = match(escapeRegex(rewrite?.source) ?? "");
    const _match = fromSource(rawPath);
    if (_match) {
      const { params } = _match;
      const isUsingParams = Object.keys(params).length > 0;
      if (isUsingParams) {
        const rewrittenPath = unescapeRegex(toDestination(params));
        rewrittenUrl = isExternalRewrite
          ? `${protocol}//${hostname}${rewrittenPath}`
          : `${rewrittenPath}`;
      } else {
        rewrittenUrl = rewrite.destination;
      }
      debug("rewrittenUrl", rewrittenUrl);
    }
  }

  const queryString = urlQueryString ? `?${urlQueryString}` : "";

  return {
    internalEvent: {
      ...event,
      rawPath: rewrittenUrl,
      url: `${rewrittenUrl}${queryString}`,
    },
    __rewrite: rewrite,
    isExternalRewrite,
  };
}

export function handleRedirects(
  event: InternalEvent,
  redirects: RedirectDefinition[],
): InternalResult | undefined {
  const { internalEvent, __rewrite } = handleRewrites(event, redirects);
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

export function fixDataPage(internalEvent: InternalEvent, buildId: string) {
  const { rawPath, query } = internalEvent;
  const dataPattern = `/_next/data/${buildId}`;

  if (rawPath.startsWith(dataPattern) && rawPath.endsWith(".json")) {
    const newPath = rawPath.replace(dataPattern, "").replace(/\.json$/, "");
    query.__nextDataReq = "1";
    const urlQuery: Record<string, string> = {};
    Object.keys(query).forEach((k) => {
      const v = query[k];
      urlQuery[k] = Array.isArray(v) ? v.join(",") : v;
    });
    return {
      ...internalEvent,
      rawPath: newPath,
      query,
      url: `${newPath}${
        query ? `?${new URLSearchParams(urlQuery).toString()}` : ""
      }`,
    };
  }
  return internalEvent;
}
