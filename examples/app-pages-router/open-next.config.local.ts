import type {
  OpenNextConfig,
  OverrideOptions,
} from "@opennextjs/aws/types/open-next.js";

const devOverride = {
  wrapper: "express-dev",
  converter: "node",
  incrementalCache: "fs-dev",
  queue: "direct",
  tagCache: "fs-dev-nextMode",
} satisfies OverrideOptions;

export default {
  default: {
    override: devOverride,
  },
  functions: {
    api: {
      override: devOverride,
      routes: ["app/api/client/route", "app/api/host/route", "pages/api/hello"],
      patterns: ["/api/*"],
    },
  },
  imageOptimization: {
    override: {
      wrapper: "dummy",
      converter: "dummy",
    },
    loader: "fs-dev",
  },
  // You can override the build command here so that you don't have to rebuild next every time you make a change
  //buildCommand: "echo 'No build command'",
} satisfies OpenNextConfig;
