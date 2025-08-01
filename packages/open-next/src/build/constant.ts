//TODO: Move all other manifest path here as well
export const MIDDLEWARE_TRACE_FILE = "server/middleware.js.nft.json";
export const INSTRUMENTATION_TRACE_FILE = "server/instrumentation.js.nft.json";

export const LOCAL_CONFIG_PATH = "./open-next.config.local.ts";
/**
 * https://opennext.js.org/aws/contribute/local_run
 * This is an OpenNext config to run the default server function locally
 * Be aware that this will not work the same way as in production.
 * Its mostly used for debugging and development purposes.
 */
export const LOCAL_CONFIG = `export default {
  default: {
    override: {
      wrapper: "express-dev",
      converter: "node",
      incrementalCache: "fs-dev",
      queue: "direct",
      tagCache: "fs-dev",
    },
  },
  imageOptimization: {
    override: {
      wrapper: "dummy",
      converter: "dummy",
    },
    loader: "fs-dev",
    // This part is not needed on ARM Linux as it will be installed by default
    // Remember to change this depending on your arch and system
    install: {
      arch: "x64",
      packages: ["sharp"],
    },
  },
}`;
