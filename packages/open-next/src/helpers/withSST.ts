import {
  FunctionOptions,
  OpenNextConfig,
  RouteTemplate,
} from "types/open-next";

type SSTCompatibleFunction = FunctionOptions & {
  override?: {
    wrapper?: "aws-lambda-streaming" | "aws-lambda";
    converter?: "aws-apigw-v2" | "aws-apigw-v1" | "aws-cloudfront";
  };
};

type SSTCompatibleSplittedFunction = {
  routes: RouteTemplate[];
  patterns: string[];
} & SSTCompatibleFunction;

type SSTCompatibleConfig<
  Fn extends Record<string, SSTCompatibleSplittedFunction>,
> = {
  default: SSTCompatibleFunction;
  functions?: Fn;
  middleware?: {
    external: true;
  };
} & Pick<
  OpenNextConfig,
  | "dangerous"
  | "appPath"
  | "buildCommand"
  | "buildOutputPath"
  | "packageJsonPath"
>;

/**
 * This function makes it more straightforward to use SST with OpenNext.
 * All options are already restricted to SST compatible options only.
 * Some options not present here can be used in SST, but it's an advanced use case that
 * can easily break the deployment. If you need to use those options, you should just provide a
 * compatible OpenNextConfig inside your `open-next.config.ts` file.
 * @example
 * ```ts
  export default withSST({
    default: {
      override: {
        wrapper: "aws-lambda-streaming",
      },
    },
    functions: {
      "api/*": {
        routes: ["app/api/test/route", "page/api/otherApi"],
        patterns: ["/api/*"],
      },
    },
  });
 * ```
 */
export function withSST<
  Fn extends Record<string, SSTCompatibleSplittedFunction>,
>(config: SSTCompatibleConfig<Fn>) {
  return {
    ...config,
  } satisfies OpenNextConfig;
}
