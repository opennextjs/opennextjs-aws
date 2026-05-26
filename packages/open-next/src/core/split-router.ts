import { pathToRegexp } from "path-to-regexp";

export interface SplittedFunctionOptions {
  routes: string[];
  functionId: string;
}

export interface SplitRouter {
  match: (path: string) => string | undefined;
}

interface PatternRoute {
  regex: RegExp;
  functionId: string;
}

export function createSplitRouter(
  options: SplittedFunctionOptions[]
): SplitRouter {
  const exactRoutes = new Map<string, string>();
  const patternRoutes: PatternRoute[] = [];

  for (const { routes, functionId } of options) {
    for (const route of routes) {
      const hasDynamic =
        route.includes(":") ||
        route.includes("[") ||
        route.includes("*") ||
        route.includes("?") ||
        route.includes("+");

      if (!hasDynamic) {
        exactRoutes.set(route, functionId);
      } else {
        try {
          const regex = pathToRegexp(route, [], {
            strict: false,
            sensitive: false,
            end: true,
          });
          patternRoutes.push({ regex, functionId });
        } catch {
          // swallow invalid pattern, skip
        }
      }
    }
  }

  return {
    match(path: string): string | undefined {
      const exactMatch = exactRoutes.get(path);
      if (exactMatch) return exactMatch;

      for (const { regex, functionId } of patternRoutes) {
        if (regex.test(path)) return functionId;
      }
      return undefined;
    },
  };
}
