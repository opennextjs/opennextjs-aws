import type {
  FunctionOptions,
  OpenNextConfig,
  RouteTemplate,
  SplittedFunctionOptions,
} from "types/open-next";

type CloudflareCompatibleFunction<Placement extends "regional" | "global"> =
  Placement extends "regional"
    ? FunctionOptions & {
        placement: "regional";
      }
    : { placement: "global" };

type CloudflareCompatibleRoutes<Placement extends "regional" | "global"> =
  Placement extends "regional"
    ? {
        placement: "regional";
        routes: RouteTemplate[];
        patterns: string[];
      }
    : {
        placement: "global";
        routes: `app/${string}/route`;
        patterns: string;
      };

type CloudflareCompatibleSplittedFunction<
  Placement extends "regional" | "global" = "regional",
> = CloudflareCompatibleRoutes<Placement> &
  CloudflareCompatibleFunction<Placement>;

type CloudflareConfig<
  Fn extends Record<
    string,
    CloudflareCompatibleSplittedFunction<"global" | "regional">
  >,
> = {
  default: CloudflareCompatibleFunction<"regional">;
  functions?: Fn;
} & Omit<OpenNextConfig, "default" | "functions" | "middleware">;

type InterpolatedSplittedFunctionOptions<
  Fn extends Record<
    string,
    CloudflareCompatibleSplittedFunction<"global" | "regional">
  >,
> = {
  [K in keyof Fn]: SplittedFunctionOptions;
};

/**
 * This function makes it easier to use Cloudflare with OpenNext.
 * All options are already restricted to Cloudflare compatible options.
 * @example
 * ```ts
 export default withCloudflare({
  default: {
    placement: "regional",
    runtime: "node",
  },
  functions: {
    api: {
      placement: "regional",
      runtime: "node",
      routes: ["app/api/test/route", "page/api/otherApi"],
      patterns: ["/api/*"],
    },
    global: {
      placement: "global",
      runtime: "edge",
      routes: "app/test/page",
      patterns: "/page",
    },
  },
});
 * ```
 */
export function withCloudflare<
  Fn extends Record<
    string,
    CloudflareCompatibleSplittedFunction<"global" | "regional">
  >,
  Key extends keyof Fn,
>(config: CloudflareConfig<Fn>) {
  const functions = Object.entries(config.functions ?? {}).reduce(
    (acc, [name, fn]) => {
      const _name = name as Key;
      acc[_name] =
        fn.placement === "global"
          ? {
              placement: "global",
              runtime: "edge",
              routes: [fn.routes],
              patterns: [fn.patterns],
              override: {
                wrapper: "cloudflare",
                converter: "edge",
              },
            }
          : { ...fn, placement: "regional" };
      return acc;
    },
    {} as InterpolatedSplittedFunctionOptions<Fn>,
  );
  return {
    default: config.default,
    functions: functions,
    middleware: {
      external: true,
      originResolver: "pattern-env",
      override: {
        wrapper: "cloudflare",
        converter: "edge",
      },
    },
  } satisfies OpenNextConfig;
}
