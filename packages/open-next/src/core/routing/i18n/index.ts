import { NextConfig } from "config/index.js";
import type { DomainLocale, i18nConfig } from "types/next-types";
import type { InternalEvent, InternalResult } from "types/open-next";

import { emptyReadableStream } from "utils/stream.js";
import { debug } from "../../../adapters/logger.js";
import { constructNextUrl } from "../util.js";
import { acceptLanguage } from "./accept-header";

function isLocalizedPath(path: string): boolean {
  return (
    NextConfig.i18n?.locales.includes(path.split("/")[1].toLowerCase()) ?? false
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

// Inspired by https://github.com/vercel/next.js/blob/6d93d652e0e7ba72d9a3b66e78746dce2069db03/packages/next/src/shared/lib/i18n/detect-domain-locale.ts#L3-L25
export function detectDomainLocale({
  hostname,
  detectedLocale,
}: {
  hostname?: string;
  detectedLocale?: string;
}): DomainLocale | undefined {
  const i18n = NextConfig.i18n;
  if (!i18n || i18n.localeDetection === false || !i18n.domains) {
    return;
  }
  const lowercasedLocale = detectedLocale?.toLowerCase();
  for (const domain of i18n.domains) {
    // We remove the port if present
    const domainHostname = domain.domain.split(":", 1)[0].toLowerCase();
    if (
      hostname === domainHostname ||
      lowercasedLocale === domain.defaultLocale.toLowerCase() ||
      domain.locales?.some(
        (locale) => lowercasedLocale === locale.toLowerCase(),
      )
    ) {
      return domain;
    }
  }
}

export function detectLocale(
  internalEvent: InternalEvent,
  i18n: i18nConfig,
): string {
  if (i18n.localeDetection === false) {
    return i18n.defaultLocale;
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
  });

  const domainLocale = detectDomainLocale({
    hostname: internalEvent.headers.host,
  });

  return (
    domainLocale?.defaultLocale ??
    cookiesLocale ??
    preferredLocale ??
    i18n.defaultLocale
  );
}

export function localizePath(internalEvent: InternalEvent): string {
  const i18n = NextConfig.i18n;
  if (!i18n) {
    return internalEvent.rawPath;
  }
  if (isLocalizedPath(internalEvent.rawPath)) {
    return internalEvent.rawPath;
  }

  const detectedLocale = detectLocale(internalEvent, i18n);

  return `/${detectedLocale}${internalEvent.rawPath}`;
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
    return {
      type: "core",
      statusCode: 307,
      headers: {
        Location: constructNextUrl(internalEvent.url, `/${detectedLocale}`),
      },
      body: emptyReadableStream(),
      isBase64Encoded: false,
    };
  }
  return false;
}
