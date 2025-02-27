import { NextConfig } from "config/index.js";
import type { i18nConfig } from "types/next-types";
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

  return cookiesLocale ?? preferredLocale ?? i18n.defaultLocale;

  // TODO: handle domain based locale detection
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
