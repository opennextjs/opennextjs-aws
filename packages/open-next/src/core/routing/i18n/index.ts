import { NextConfig } from "config/index.js";
import type { DomainLocale, i18nConfig } from "types/next-types";
import type { InternalEvent, InternalResult } from "types/open-next";

import { emptyReadableStream } from "utils/stream.js";
import { debug } from "../../../adapters/logger.js";
import { constructNextUrl, convertToQueryString } from "../util.js";
import { acceptLanguage } from "./accept-header";

type LocaleSource = "preferred" | "default";

/**
 * Checks the first segment against the configured locales, case-insensitively as in Next.js.
 *
 * @param path The path to check, without the basePath
 * @returns Whether the path starts with a locale
 */
export function isLocalizedPath(path: string): boolean {
  const segment = path.split("/", 2)[1]?.toLowerCase();
  return (
    NextConfig.i18n?.locales.some(
      (locale) => locale.toLowerCase() === segment,
    ) ?? false
  );
}

// https://github.com/vercel/next.js/blob/canary/packages/next/src/shared/lib/i18n/get-locale-redirect.ts
function getLocaleFromCookie(cookies: Record<string, string>) {
  const i18n = NextConfig.i18n;
  const nextLocale = cookies.NEXT_LOCALE?.toLowerCase();
  return nextLocale
    ? i18n?.locales.find((locale) => nextLocale === locale.toLowerCase())
    : undefined;
}

/**
 * Returns the lowercase hostname without its port, as Next.js `getHostname` does.
 *
 * @param host The host, optionally with a port
 * @returns The lowercase hostname
 */
function normalizeDomainHost(host: string): string {
  return host.split(":", 1)[0].toLowerCase();
}

// Inspired by https://github.com/vercel/next.js/blob/6d93d652e0e7ba72d9a3b66e78746dce2069db03/packages/next/src/shared/lib/i18n/detect-domain-locale.ts#L3-L25
/**
 * Finds a locale domain by hostname (ignoring case and port) or locale.
 *
 * @param arg an object containing the hostname and detectedLocale
 * @returns The `DomainLocale` object if a domain is detected, `undefined` otherwise
 */
export function detectDomainLocale({
  hostname,
  detectedLocale,
}: {
  hostname?: string;
  detectedLocale?: string;
}): DomainLocale | undefined {
  const i18n = NextConfig.i18n;
  const domains = i18n?.domains;
  if (!domains) {
    return;
  }
  const lowercasedLocale = detectedLocale?.toLowerCase();
  const requestHostname = hostname && normalizeDomainHost(hostname);
  for (const domain of domains) {
    if (
      requestHostname === normalizeDomainHost(domain.domain) ||
      lowercasedLocale === domain.defaultLocale.toLowerCase() ||
      domain.locales?.some(
        (locale) => lowercasedLocale === locale.toLowerCase(),
      )
    ) {
      return domain;
    }
  }
}

/**
 * Selects the locale for a request without an explicit locale.
 *
 * @param internalEvent The request supplying the host and visitor preferences
 * @param i18n The locale configuration
 * @param localeSource Whether to consider visitor preferences
 * @returns The selected locale, falling back to the domain or configured default
 */
export function detectLocale(
  internalEvent: InternalEvent,
  i18n: i18nConfig,
  localeSource: LocaleSource = "preferred",
): string {
  const domainLocale = detectDomainLocale({
    hostname: internalEvent.headers.host,
  });
  if (localeSource === "default" || i18n.localeDetection === false) {
    return domainLocale?.defaultLocale ?? i18n.defaultLocale;
  }

  const cookiesLocale = getLocaleFromCookie(internalEvent.cookies);
  const preferredLocale = acceptLanguage(
    internalEvent.headers["accept-language"],
    i18n?.locales,
  );
  debug({
    cookiesLocale,
    preferredLocale,
    defaultLocale: i18n.defaultLocale,
    domainLocale,
  });

  return (
    domainLocale?.defaultLocale ??
    cookiesLocale ??
    preferredLocale ??
    i18n.defaultLocale
  );
}

/**
 * Localizes the routing path after any basePath, as Next.js matchers expect.
 *
 * @param internalEvent The request to localize
 * @param localeSource Which locale to use when the path has none
 * @returns The localized path, unchanged when i18n is not configured or the path is already localized
 */
export function localizePath(
  internalEvent: InternalEvent,
  localeSource: LocaleSource = "preferred",
): string {
  const { rawPath } = internalEvent;
  if (!NextConfig.i18n) return rawPath;
  const basePath = NextConfig.basePath;
  const prefix =
    basePath && (rawPath === basePath || rawPath.startsWith(`${basePath}/`))
      ? basePath
      : "";
  // Keep the empty suffix distinct from "/": /docs and /docs/ match differently.
  return (
    prefix +
    localizePathname(internalEvent, rawPath.slice(prefix.length), localeSource)
  );
}

/**
 * Prepends a locale to a basePath-free pathname unless it already has one.
 *
 * @param internalEvent The request used to detect the locale
 * @param pathname The pathname, without the basePath
 * @param localeSource Which locale to use when the path has none
 * @returns The localized pathname, unchanged when i18n is not configured or the pathname is already localized
 */
export function localizePathname(
  internalEvent: InternalEvent,
  pathname: string,
  localeSource: LocaleSource = "preferred",
): string {
  const i18n = NextConfig.i18n;
  if (!i18n || isLocalizedPath(pathname)) {
    return pathname;
  }

  return `/${detectLocale(internalEvent, i18n, localeSource)}${pathname}`;
}

/**
 *
 * @param internalEvent
 * In this function, for domain locale redirect we need to rely on the host to be present and correct
 * @returns `false` if no redirect is needed, `InternalResult` if a redirect is needed
 */
export function handleLocaleRedirect(
  internalEvent: InternalEvent,
): false | InternalResult {
  const i18n = NextConfig.i18n;
  if (
    !i18n ||
    i18n.localeDetection === false ||
    internalEvent.rawPath !== "/"
  ) {
    return false;
  }
  const preferredLocale = acceptLanguage(
    internalEvent.headers["accept-language"],
    i18n?.locales,
  );

  const detectedLocale = detectLocale(internalEvent, i18n);

  const domainLocale = detectDomainLocale({
    hostname: internalEvent.headers.host,
  });
  const preferredDomain = detectDomainLocale({
    detectedLocale: preferredLocale,
  });

  if (domainLocale && preferredDomain) {
    const isPDomain = preferredDomain.domain === domainLocale.domain;
    const isPLocale = preferredDomain.defaultLocale === preferredLocale;
    if (!isPDomain || !isPLocale) {
      const scheme = `http${preferredDomain.http ? "" : "s"}`;
      const rlocale = isPLocale ? "" : preferredLocale;
      return {
        type: "core",
        statusCode: 307,
        headers: {
          Location: `${scheme}://${preferredDomain.domain}/${rlocale}`,
        },
        body: emptyReadableStream(),
        isBase64Encoded: false,
      };
    }
  }

  const defaultLocale = domainLocale?.defaultLocale ?? i18n.defaultLocale;

  if (detectedLocale.toLowerCase() !== defaultLocale.toLowerCase()) {
    const nextUrl = constructNextUrl(
      internalEvent.url,
      `/${detectedLocale}${NextConfig.trailingSlash ? "/" : ""}`,
    );
    const queryString = convertToQueryString(internalEvent.query);
    return {
      type: "core",
      statusCode: 307,
      headers: {
        Location: `${nextUrl}${queryString}`,
      },
      body: emptyReadableStream(),
      isBase64Encoded: false,
    };
  }
  return false;
}
