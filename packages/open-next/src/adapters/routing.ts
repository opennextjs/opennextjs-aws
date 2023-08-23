import { compile, match } from "path-to-regexp";

import { InternalEvent } from "./event-mapper.js";
import { debug } from "./logger.js";
import {
  RedirectDefinition,
  RewriteDefinition,
  RewriteMatcher,
} from "./next-types.js";
import { IncomingMessage } from "./request.js";
import { ServerResponse } from "./response.js";
import { escapeRegex, unescapeRegex } from "./util.js";

const redirectMatcher =
  (
    headers: Record<string, string>,
    cookies: Record<string, string>,
    query: Record<string, string | string[]>,
  ) =>
  (redirect: RewriteMatcher) => {
    switch (redirect.type) {
      case "header":
        return (
          headers?.[redirect.key.toLowerCase()] &&
          new RegExp(redirect.value ?? "").test(
            headers[redirect.key.toLowerCase()] ?? "",
          )
        );
      case "cookie":
        return (
          cookies?.[redirect.key] &&
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
          headers?.host && new RegExp(redirect.value ?? "").test(headers.host)
        );
      default:
        return false;
    }
  };

function isExternal(url?: string) {
  if (!url) return false;
  const pattern = /^https?:\/\//;
  return pattern.test(url);
}

function getUrlParts(url: string, isExternal: boolean) {
  if (!isExternal) {
    return {
      hostname: "",
      pathname: url,
      protocol: "",
    };
  }
  const { hostname, pathname, protocol } = new URL(url);
  return {
    hostname,
    pathname,
    protocol,
  };
}

export function handleRewrites<T extends RewriteDefinition>(
  internalEvent: InternalEvent,
  rewrites: T[],
) {
  const { rawPath, headers, query, cookies } = internalEvent;
  const matcher = redirectMatcher(headers, cookies, query);
  const rewrite = rewrites.find(
    (route) =>
      new RegExp(route.regex).test(rawPath) &&
      (route.has
        ? route.has.reduce((acc, cur) => {
            if (acc === false) return false;
            return matcher(cur);
          }, true)
        : true) &&
      (route.missing
        ? route.missing.reduce((acc, cur) => {
            if (acc === false) return false;
            return !matcher(cur);
          }, true)
        : true),
  );

  const urlQueryString = new URLSearchParams(query).toString();
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
          : `/${rewrittenPath}`;
      } else {
        rewrittenUrl = rewrite.destination;
      }
      debug("rewrittenUrl", rewrittenUrl);
    }
  }

  return {
    rawPath: rewrittenUrl,
    url: `${rewrittenUrl}${urlQueryString ? `?${urlQueryString}` : ""}`,
    __rewrite: rewrite,
    isExternalRewrite,
  };
}

export function handleRedirects(
  internalEvent: InternalEvent,
  redirects: RedirectDefinition[],
) {
  const { url, __rewrite } = handleRewrites(internalEvent, redirects);
  if (__rewrite && !__rewrite.internal) {
    return {
      statusCode: __rewrite.statusCode ?? 308,
      headers: {
        Location: url,
      },
    };
  }
}

export async function proxyRequest(req: IncomingMessage, res: ServerResponse) {
  const HttpProxy = require("next/dist/compiled/http-proxy") as any;

  const proxy = new HttpProxy({
    changeOrigin: true,
    ignorePath: true,
    xfwd: true,
  });

  await new Promise<void>((resolve, reject) => {
    proxy.on("proxyRes", () => {
      resolve();
    });

    proxy.on("error", (err: any) => {
      reject(err);
    });

    proxy.web(req, res, {
      target: req.url,
      headers: req.headers,
    });
  });
}
