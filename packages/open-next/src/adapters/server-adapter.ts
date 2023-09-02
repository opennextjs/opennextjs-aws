import path from "node:path";

import { debug } from "./logger.js";
import { lambdaHandler } from "./plugins/lambdaHandler.js";
import {
  loadBuildId,
  loadConfig,
  loadPublicAssets,
  setNodeEnv,
} from "./util.js";

export const NEXT_DIR = path.join(__dirname, ".next");
export const OPEN_NEXT_DIR = path.join(__dirname, ".open-next");
export const config = loadConfig(NEXT_DIR);

debug({ NEXT_DIR, OPEN_NEXT_DIR });

const buildId = loadBuildId(NEXT_DIR);
setNodeEnv();
setBuildIdEnv();
setNextjsServerWorkingDirectory();

const publicAssets = loadPublicAssets(OPEN_NEXT_DIR);

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
  process.env.NEXT_BUILD_ID = buildId;
}
