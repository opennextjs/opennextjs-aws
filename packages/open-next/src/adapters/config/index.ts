import path from "node:path";

import type { RouteDefinition } from "types/next-types";
import { debug } from "../logger";
import {
  loadAppPathRoutesManifest,
  loadAppPathsManifest,
  loadAppPathsManifestKeys,
  loadBuildId,
  loadConfig,
  loadConfigHeaders,
  loadFunctionsConfigManifest,
  loadHtmlPages,
  loadMiddlewareManifest,
  loadPagesManifest,
  loadPrerenderManifest,
  loadRoutesManifest,
} from "./util.js";

export const NEXT_DIR = path.join(__dirname, ".next");
export const OPEN_NEXT_DIR = path.join(__dirname, ".open-next");

debug({ NEXT_DIR, OPEN_NEXT_DIR });

//TODO: inject these values at build time
export const NextConfig = /* @__PURE__ */ loadConfig(NEXT_DIR);
export const BuildId = /* @__PURE__ */ loadBuildId(NEXT_DIR);
export const HtmlPages = /* @__PURE__ */ loadHtmlPages(NEXT_DIR);
// export const PublicAssets = loadPublicAssets(OPEN_NEXT_DIR);
export const RoutesManifest = /* @__PURE__ */ loadRoutesManifest(NEXT_DIR);
export const ConfigHeaders = /* @__PURE__ */ loadConfigHeaders(NEXT_DIR);
export const PrerenderManifest =
  /* @__PURE__ */ loadPrerenderManifest(NEXT_DIR);
export const AppPathsManifestKeys =
  /* @__PURE__ */ loadAppPathsManifestKeys(NEXT_DIR);
export const MiddlewareManifest =
  /* @__PURE__ */ loadMiddlewareManifest(NEXT_DIR);
export const AppPathsManifest = /* @__PURE__ */ loadAppPathsManifest(NEXT_DIR);
export const AppPathRoutesManifest =
  /* @__PURE__ */ loadAppPathRoutesManifest(NEXT_DIR);

export const FunctionsConfigManifest =
  /* @__PURE__ */ loadFunctionsConfigManifest(NEXT_DIR);

/**
 * Returns static API routes for both app and pages router cause Next will filter them out in staticRoutes in `routes-manifest.json`.
 * We also need to filter out page files that are under `app/api/*` as those would not be present in the routes manifest either.
 * This line from Next.js skips it:
 * https://github.com/vercel/next.js/blob/ded56f952154a40dcfe53bdb38c73174e9eca9e5/packages/next/src/build/index.ts#L1299
 *
 * Without it handleFallbackFalse will 404 on static API routes if there is a catch-all route on root level.
 */
export function getStaticAPIRoutes(): RouteDefinition[] {
  const createRouteDefinition = (route: string) => ({
    page: route,
    regex: `^${route}(?:/)?$`,
  });
  const dynamicRoutePages = new Set(
    RoutesManifest.routes.dynamic.map(({ page }) => page),
  );
  const PagesManifest = loadPagesManifest(NEXT_DIR);
  const pagesStaticAPIRoutes = Object.keys(PagesManifest)
    .filter(
      (route) => route.startsWith("/api/") && !dynamicRoutePages.has(route),
    )
    .map(createRouteDefinition);

  // We filter out both static API and page routes from the app paths manifest
  const appPathsStaticAPIRoutes = Object.values(AppPathRoutesManifest)
    .filter(
      (route) =>
        route.startsWith("/api/") ||
        (route === "/api" && !dynamicRoutePages.has(route)),
    )
    .map(createRouteDefinition);

  return [...pagesStaticAPIRoutes, ...appPathsStaticAPIRoutes];
}
