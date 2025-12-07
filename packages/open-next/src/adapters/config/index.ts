import path from "node:path";

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

export const NextConfig = /* @__PURE__ */ loadConfig(NEXT_DIR);
export const BuildId = /* @__PURE__ */ loadBuildId(NEXT_DIR);
export const HtmlPages = /* @__PURE__ */ loadHtmlPages(NEXT_DIR);
// export const PublicAssets = loadPublicAssets(OPEN_NEXT_DIR);
export const RoutesManifest = /* @__PURE__ */ loadRoutesManifest(NEXT_DIR);
export const ConfigHeaders = /* @__PURE__ */ loadConfigHeaders(NEXT_DIR);
export const PrerenderManifest =
  /* @__PURE__ */ loadPrerenderManifest(NEXT_DIR);
export const PagesManifest = /* @__PURE__ */ loadPagesManifest(NEXT_DIR);
export const AppPathsManifestKeys =
  /* @__PURE__ */ loadAppPathsManifestKeys(NEXT_DIR);
export const MiddlewareManifest =
  /* @__PURE__ */ loadMiddlewareManifest(NEXT_DIR);
export const AppPathsManifest = /* @__PURE__ */ loadAppPathsManifest(NEXT_DIR);
export const AppPathRoutesManifest =
  /* @__PURE__ */ loadAppPathRoutesManifest(NEXT_DIR);

export const FunctionsConfigManifest =
  /* @__PURE__ */ loadFunctionsConfigManifest(NEXT_DIR);

process.env.NEXT_BUILD_ID = BuildId;
process.env.NEXT_PREVIEW_MODE_ID = PrerenderManifest?.preview?.previewModeId;
