/* eslint-disable unused-imports/no-unused-imports */
// We load every config here so that they are only loaded once
// and during cold starts
import {
  AppPathsManifestKeys,
  BuildId,
  ConfigHeaders,
  HtmlPages,
  NEXT_DIR,
  NextConfig,
  OPEN_NEXT_DIR,
  PrerenderManifest,
  PublicAssets,
  RoutesManifest,
} from "./config/index.js";
import { lambdaHandler } from "./plugins/lambdaHandler.js";
import { setNodeEnv } from "./util.js";

setNodeEnv();
setBuildIdEnv();
setNextjsServerWorkingDirectory();

/////////////
// Handler //
/////////////

export const handler = lambdaHandler;

//////////////////////
// Helper functions //
//////////////////////

function setNextjsServerWorkingDirectory() {
  // WORKAROUND: Set `NextServer` working directory (AWS specific) — https://github.com/serverless-stack/open-next#workaround-set-nextserver-working-directory-aws-specific
  process.chdir(__dirname);
}

function setBuildIdEnv() {
  // This allows users to access the CloudFront invalidating path when doing on-demand
  // invalidations. ie. `/_next/data/${process.env.NEXT_BUILD_ID}/foo.json`
  process.env.NEXT_BUILD_ID = BuildId;
}
