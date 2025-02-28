import { NextConfig } from "config/index.js";
import type { DomainLocale, i18nConfig } from "types/next-types";
import type { InternalEvent } from "types/open-next";

import { debug } from "../../../adapters/logger.js";
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

// Inspired by https://github.com/vercel/next.js/blob/canary/packages/next/src/shared/lib/i18n/detect-domain-locale.ts
export function detectDomainLocale(
  hostname: string,
  i18n: i18nConfig,
  detectedLocale?: string,
): DomainLocale | undefined {
  if (i18n.localeDetection === false) {
    return;
  }
  if (!i18n.domains) {
    return;
  }
  for (const item of i18n.domains) {
    // We remove the port if present
    const domainHostname = item.domain.split(":", 1)[0].toLowerCase();
    if (
      hostname === domainHostname ||
      detectedLocale === item.defaultLocale.toLowerCase() ||
      item.locales?.some((locale) => detectedLocale === locale.toLowerCase())
    ) {
      return item;
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

  const domainLocale = detectDomainLocale(internalEvent.headers.host, i18n);

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
  const preferredLocale = acceptLanguage(
    internalEvent.headers["accept-language"],
    i18n?.locales,
  );

  const detectedLocale = detectLocale(internalEvent, i18n);

  // not entirely sure if we should do that or not here
  if (preferredLocale && preferredLocale !== detectedLocale) {
    return `/${preferredLocale}${internalEvent.rawPath}`;
  }

  return `/${detectedLocale}${internalEvent.rawPath}`;
}
