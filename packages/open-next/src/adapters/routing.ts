import { InternalEvent } from './event-mapper.js';
import { debug } from './logger.js';
import {
  RedirectDefinition,
  RewriteDefinition,
  RewriteMatcher,
} from './next-types.js';
import { compile, match } from 'path-to-regexp';
import { escapeRegex, unescapeRegex } from './util.js';

const redirectMatcher =
  (
    headers: Record<string, string>,
    cookies: Record<string, string>,
    query: Record<string, string | string[]>
  ) =>
  (redirect: RewriteMatcher) => {
    switch (redirect.type) {
      case 'header':
        return (
          headers?.[redirect.key.toLowerCase()] &&
          new RegExp(redirect.value ?? '').test(
            headers[redirect.key.toLowerCase()] ?? ''
          )
        );
      case 'cookie':
        return (
          cookies?.[redirect.key] &&
          new RegExp(redirect.value ?? '').test(cookies[redirect.key] ?? '')
        );
      case 'query':
        return query[redirect.key] && Array.isArray(redirect.value)
          ? redirect.value.reduce(
              (prev, current) =>
                prev || new RegExp(current).test(query[redirect.key] as string),
              false
            )
          : new RegExp(redirect.value ?? '').test(
              (query[redirect.key] as string | undefined) ?? ''
            );
      case 'host':
        return (
          headers?.host && new RegExp(redirect.value ?? '').test(headers.host)
        );
      default:
        return false;
    }
  };

export function handleRewrites<T extends RewriteDefinition>(
  internalEvent: InternalEvent,
  rewrites: T[]
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
        : true)
  );

  const urlQueryString = new URLSearchParams(query).toString();
  let rewrittenUrl = rawPath;
  if (rewrite) {
    const toDestination = compile(
      escapeRegex(rewrite?.destination ?? '') ?? ''
    );
    const fromSource = match(escapeRegex(rewrite?.source) ?? '');
    const _match = fromSource(rawPath);
    if (_match) {
      const { params } = _match;
      const isUsingParams = Object.keys(params).length > 0;
      if (isUsingParams) {
        rewrittenUrl = unescapeRegex(toDestination(params));
      } else {
        rewrittenUrl = rewrite.destination;
      }
      debug('rewrittenUrl', rewrittenUrl);
    }
  }

  return {
    rawPath: rewrittenUrl,
    url: `${rewrittenUrl}${urlQueryString ? `?${urlQueryString}` : ''}`,
    __rewrite: rewrite,
  };
}

export function handleRedirects(
  internalEvent: InternalEvent,
  redirects: RedirectDefinition[]
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
