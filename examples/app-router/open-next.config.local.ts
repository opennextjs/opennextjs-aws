import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
 
export default {
  default: {
    override: {
      wrapper: "express-dev",
      converter: "node",
      incrementalCache: "fs-dev",
      queue: "direct",
      tagCache: "dummy",
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