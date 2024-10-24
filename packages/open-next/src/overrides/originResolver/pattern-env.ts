import type { Origin, OriginResolver } from "types/open-next";

import { debug, error } from "../../adapters/logger";

const envLoader: OriginResolver = {
  name: "env",
  resolve: async (_path: string) => {
    try {
      const origin = JSON.parse(process.env.OPEN_NEXT_ORIGIN ?? "{}") as Record<
        string,
        Origin
      >;
      for (const [key, value] of Object.entries(
        globalThis.openNextConfig.functions ?? {},
      ).filter(([key]) => key !== "default")) {
        if (
          value.patterns.some((pattern) => {
            // Convert cloudfront pattern to regex
            return new RegExp(
              // transform glob pattern to regex
              "/" +
                pattern
                  .replace(/\*\*/g, "(.*)")
                  .replace(/\*/g, "([^/]*)")
                  .replace(/\//g, "\\/")
                  .replace(/\?/g, "."),
            ).test(_path);
          })
        ) {
          debug("Using origin", key, value.patterns);
          return origin[key];
        }
      }
      if (_path.startsWith("/_next/image") && origin["imageOptimizer"]) {
        debug("Using origin", "imageOptimizer", _path);
        return origin["imageOptimizer"];
      }
      if (origin["default"]) {
        debug("Using default origin", origin["default"], _path);
        return origin["default"];
      }
      return false as const;
    } catch (e) {
      error("Error while resolving origin", e);
      return false as const;
    }
  },
};

export default envLoader;
