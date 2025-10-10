import type { Origin } from "types/open-next";
import type { OriginResolver } from "types/overrides";

import { debug, error } from "../../adapters/logger";

// Cache parsed origin and compiled patterns at module level
let cachedOrigin: Record<string, Origin> | null = null;
const cachedPatterns: Array<{
  key: string;
  patterns: string[];
  regexes: RegExp[];
}> = [];
let initialized = false;

function initialize() {
  if (initialized) return;

  // Parse origin JSON once
  cachedOrigin = JSON.parse(process.env.OPEN_NEXT_ORIGIN ?? "{}") as Record<
    string,
    Origin
  >;

  // Pre-compile all regex patterns
  const functions = globalThis.openNextConfig.functions ?? {};
  for (const key in functions) {
    if (key !== "default") {
      const value = functions[key];
      const regexes: RegExp[] = [];

      for (const pattern of value.patterns) {
        // Convert cloudfront pattern to regex
        const regexPattern = `/${pattern
          .replace(/\*\*/g, "(.*)")
          .replace(/\*/g, "([^/]*)")
          .replace(/\//g, "\\/")
          .replace(/\?/g, ".")}`;
        regexes.push(new RegExp(regexPattern));
      }

      cachedPatterns.push({
        key,
        patterns: value.patterns,
        regexes,
      });
    }
  }

  initialized = true;
}

const envLoader: OriginResolver = {
  name: "env",
  resolve: async (_path: string) => {
    try {
      initialize();

      // Use cached origin
      const origin = cachedOrigin!;

      // Test against pre-compiled patterns
      for (const { key, patterns, regexes } of cachedPatterns) {
        for (const regex of regexes) {
          if (regex.test(_path)) {
            debug("Using origin", key, patterns);
            return origin[key];
          }
        }
      }

      if (_path.startsWith("/_next/image") && origin.imageOptimizer) {
        debug("Using origin", "imageOptimizer", _path);
        return origin.imageOptimizer;
      }
      if (origin.default) {
        debug("Using default origin", origin.default, _path);
        return origin.default;
      }
      return false as const;
    } catch (e) {
      error("Error while resolving origin", e);
      return false as const;
    }
  },
};

export default envLoader;
