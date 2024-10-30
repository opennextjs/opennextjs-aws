// We load every config here so that they are only loaded once
// and during cold starts
import { BuildId } from "config/index.js";

import { createMainHandler } from "../core/createMainHandler.js";
import { setNodeEnv } from "./util.js";

// We load every config here so that they are only loaded once
// and during cold starts
setNodeEnv();
setBuildIdEnv();
setNextjsServerWorkingDirectory();

// Because next is messing with fetch, we have to make sure that we use an untouched version of fetch
globalThis.internalFetch = fetch;

/////////////
// Handler //
/////////////

export const handler = await createMainHandler();

//////////////////////
// Helper functions //
//////////////////////

function setNextjsServerWorkingDirectory() {
  // WORKAROUND: Set `NextServer` working directory (AWS specific)
  // See https://opennext.js.org/aws/v2/advanced/workaround#workaround-set-nextserver-working-directory-aws-specific
  process.chdir(__dirname);
}

function setBuildIdEnv() {
  // This allows users to access the CloudFront invalidating path when doing on-demand
  // invalidations. ie. `/_next/data/${process.env.NEXT_BUILD_ID}/foo.json`
  process.env.NEXT_BUILD_ID = BuildId;
}
