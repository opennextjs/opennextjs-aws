import type { Origin } from "types/open-next";
import type { OriginResolver } from "types/overrides";

import { debug, error } from "../../adapters/logger";

// Cache parsed origins and compiled patterns at module level
let cachedOrigins: Record<string, Origin>;
const cachedPatterns: Array<{
  key: string;
  patterns: string[];
  regexes: RegExp[];
}> = [];
let initialized = false;

/**
 * Initializes the cached values on the first execution
 */
function initializeOnce(): void {
  if (initialized) return;

  // Parse origin JSON once
  cachedOrigins = JSON.parse(process.env.OPEN_NEXT_ORIGIN ?? "{}") as Record<
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
      initializeOnce();

      // Test against pre-compiled patterns
      for (const { key, patterns, regexes } of cachedPatterns) {
        for (const regex of regexes) {
          if (regex.test(_path)) {
            debug("Using origin", key, patterns);
            return cachedOrigins[key];
          }
        }
      }

      if (_path.startsWith("/_next/image") && cachedOrigins.imageOptimizer) {
        debug("Using origin", "imageOptimizer", _path);
        return cachedOrigins.imageOptimizer;
      }
      if (cachedOrigins.default) {
        debug("Using default origin", cachedOrigins.default, _path);
        return cachedOrigins.default;
      }
      return false as const;
    } catch (e) {
      error("Error while resolving origin", e);
      return false as const;
    }
  },
};

export default envLoader;
