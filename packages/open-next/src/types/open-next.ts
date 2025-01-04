import type { ReadableStream } from "node:stream/web";

import type { Writable } from "node:stream";
import type { WarmerEvent, WarmerResponse } from "../adapters/warmer-function";
import type {
  Converter,
  ImageLoader,
  IncrementalCache,
  OriginResolver,
  ProxyExternalRequest,
  Queue,
  TagCache,
  Warmer,
  Wrapper,
} from "./overrides";

export type BaseEventOrResult<T extends string = string> = {
  type: T;
};

export type InternalEvent = {
  readonly method: string;
  readonly rawPath: string;
  readonly url: string;
  readonly body?: Buffer;
  readonly headers: Record<string, string>;
  readonly query: Record<string, string | string[]>;
  readonly cookies: Record<string, string>;
  readonly remoteAddress: string;
} & BaseEventOrResult<"core">;

export type InternalResult = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: ReadableStream;
  isBase64Encoded: boolean;
} & BaseEventOrResult<"core">;

export interface StreamCreator {
  writeHeaders(prelude: {
    statusCode: number;
    cookies: string[];
    headers: Record<string, string>;
  }): Writable;
  // Just to fix an issue with aws lambda streaming with empty body
  onWrite?: () => void;
  onFinish?: (length: number) => void;
}

export interface DangerousOptions {
  /**
   * The tag cache is used for revalidateTags and revalidatePath.
   * @default false
   */
  disableTagCache?: boolean;
  /**
   * The incremental cache is used for ISR and SSG.
   * Disable this only if you use only SSR
   * @default false
   */
  disableIncrementalCache?: boolean;
  /**
   * Enable the cache interception.
   * Every request will go through the cache interceptor, if it is found in the cache, it will be returned without going through NextServer.
   * Not every feature is covered by the cache interceptor and it should fallback to the NextServer if the cache is not found.
   * @default false
   */
  enableCacheInterception?: boolean;
  /**
   * Function to determine which headers or cookies takes precedence.
   * By default, the middleware headers and cookies will override the handler headers and cookies.
   * This is executed for every request and after next config headers and middleware has executed.
   */
  headersAndCookiesPriority?: (
    event: InternalEvent,
  ) => "middleware" | "handler";
}

export type BaseOverride = {
  name: string;
};
export type LazyLoadedOverride<T extends BaseOverride> = () => Promise<T>;

export interface Origin {
  host: string;
  protocol: "http" | "https";
  port?: number;
  customHeaders?: Record<string, string>;
}

export type IncludedWrapper =
  | "aws-lambda"
  | "aws-lambda-streaming"
  | "node"
  // @deprecated - use "cloudflare-edge" instead.
  | "cloudflare"
  | "cloudflare-edge"
  | "cloudflare-node"
  | "express-dev"
  | "dummy";

export type IncludedConverter =
  | "aws-apigw-v2"
  | "aws-apigw-v1"
  | "aws-cloudfront"
  | "edge"
  | "node"
  | "sqs-revalidate"
  | "dummy";

export type RouteType = "route" | "page" | "app";

export interface ResolvedRoute {
  route: string;
  type: RouteType;
}

export interface RoutingResult {
  internalEvent: InternalEvent;
  // If the request is an external rewrite, if used with an external middleware will be false on every server function
  isExternalRewrite: boolean;
  // Origin is only used in external middleware, will be false on every server function
  origin: Origin | false;
  // If the request is for an ISR route, will be false on every server function. Only used in external middleware
  isISR: boolean;
  // The initial rawPath of the request before applying rewrites, if used with an external middleware will be defined in x-opennext-initial-path header
  initialPath: string;

  // The resolved route after applying rewrites, if used with an external middleware will be defined in x-opennext-resolved-routes header as a json encoded array
  resolvedRoutes: ResolvedRoute[];
}

export interface MiddlewareResult
  extends RoutingResult,
    BaseEventOrResult<"middleware"> {}

export type IncludedQueue = "sqs" | "sqs-lite" | "direct" | "dummy";

export type IncludedIncrementalCache = "s3" | "s3-lite" | "fs-dev" | "dummy";

export type IncludedTagCache =
  | "dynamodb"
  | "dynamodb-lite"
  | "fs-dev"
  | "dummy";

export type IncludedImageLoader = "s3" | "host" | "fs-dev" | "dummy";

export type IncludedOriginResolver = "pattern-env" | "dummy";

export type IncludedWarmer = "aws-lambda" | "dummy";

export type IncludedProxyExternalRequest = "node" | "fetch" | "dummy";

export interface DefaultOverrideOptions<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> {
  /**
   * This is the main entrypoint of your app.
   * @default "aws-lambda"
   */
  wrapper?: IncludedWrapper | LazyLoadedOverride<Wrapper<E, R>>;

  /**
   * This code convert the event to InternalEvent and InternalResult to the expected output.
   * @default "aws-apigw-v2"
   */
  converter?: IncludedConverter | LazyLoadedOverride<Converter<E, R>>;
  /**
   * Generate a basic dockerfile to deploy the app.
   * If a string is provided, it will be used as the base dockerfile.
   * @default false
   */
  generateDockerfile?: boolean | string;
}

export interface OverrideOptions extends DefaultOverrideOptions {
  /**
   * Add possibility to override the default s3 cache. Used for fetch cache and html/rsc/json cache.
   * @default "s3"
   */
  incrementalCache?:
    | IncludedIncrementalCache
    | LazyLoadedOverride<IncrementalCache>;

  /**
   * Add possibility to override the default tag cache. Used for revalidateTags and revalidatePath.
   * @default "dynamodb"
   */
  tagCache?: IncludedTagCache | LazyLoadedOverride<TagCache>;

  /**
   * Add possibility to override the default queue. Used for isr.
   * @default "sqs"
   */
  queue?: IncludedQueue | LazyLoadedOverride<Queue>;

  /**
   * Add possibility to override the default proxy for external rewrite
   * @default "node"
   */
  proxyExternalRequest?:
    | IncludedProxyExternalRequest
    | LazyLoadedOverride<ProxyExternalRequest>;
}

export interface InstallOptions {
  /**
   * List of packages to install
   * @example
   * ```ts
   * install: {
   *  packages: ["sharp@0.32"]
   * }
   * ```
   */
  packages: string[];
  /**
   * @default undefined
   */
  arch?: "x64" | "arm64";
  /**
   * @default undefined
   */
  nodeVersion?: string;
  /**
   * @default undefined
   */
  libc?: "glibc" | "musl";
  /**
   * @default undefined
   * Additional arguments to pass to the install command (i.e. npm install)
   */
  additionalArgs?: string;
}

export interface DefaultFunctionOptions<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> {
  /**
   * Minify the server bundle.
   * @default false
   */
  minify?: boolean;
  /**
   * Print debug information.
   * @default false
   */
  debug?: boolean;
  /**
   * Enable overriding the default lambda.
   */
  override?: DefaultOverrideOptions<E, R>;

  /**
   * Install options for the function.
   * This is used to install additional packages to this function.
   * For image optimization, it will install sharp by default.
   * @default undefined
   */
  install?: InstallOptions;
}

export interface FunctionOptions extends DefaultFunctionOptions {
  /**
   * Runtime used
   * @default "node"
   */
  runtime?: "node" | "edge" | "deno";
  /**
   * @default "regional"
   */
  placement?: "regional" | "global";
  /**
   * Enable overriding the default lambda.
   */
  override?: OverrideOptions;

  /**
   * Bundle Next server into a single file.
   * This results in a way smaller bundle but it might break for some cases.
   * This option will probably break on every new Next.js version.
   * @default false
   * @deprecated This is not supported in 14.2+
   */
  experimentalBundledNextServer?: boolean;
}

export type RouteTemplate =
  | `app/${string}/route`
  | `app/${string}/page`
  | `app/page`
  | `app/route`
  | `pages/${string}`;

export interface SplittedFunctionOptions extends FunctionOptions {
  /**
   * Here you should specify all the routes you want to use.
   * For app routes, you should use the `app/${name}/route` format or `app/${name}/page` for pages.
   * For pages, you should use the `page/${name}` format.
   * @example
   * ```ts
   * routes: ["app/api/test/route", "app/page", "pages/admin"]
   * ```
   */
  routes: RouteTemplate[];

  /**
   * Cloudfront compatible patterns.
   * i.e. /api/*
   * @default []
   */
  patterns: string[];
}

export interface OpenNextConfig {
  default: FunctionOptions;
  functions?: Record<string, SplittedFunctionOptions>;

  /**
   * Override the default middleware
   * If you set this options, the middleware need to be deployed separately.
   * It supports both edge and node runtime.
   * @default undefined
   */
  middleware?: DefaultFunctionOptions & {
    //We force the middleware to be a function
    external: true;

    /**
     * The override options for the middleware.
     * By default the lite override are used (.i.e. s3-lite, dynamodb-lite, sqs-lite)
     * @default undefined
     */
    override?: OverrideOptions;

    /**
     * Origin resolver is used to resolve the origin for internal rewrite.
     * By default, it uses the pattern-env origin resolver.
     * Pattern env uses pattern set in split function options and an env variable OPEN_NEXT_ORIGIN
     * OPEN_NEXT_ORIGIN should be a json stringified object with the key of the splitted function as key and the origin as value
     * @default "pattern-env"
     */
    originResolver?:
      | IncludedOriginResolver
      | LazyLoadedOverride<OriginResolver>;
  };

  /**
   * Override the default warmer
   * By default, works for lambda only.
   * If you override this, you'll need to handle the warmer event in the wrapper
   * @default undefined
   */
  warmer?: DefaultFunctionOptions<WarmerEvent, WarmerResponse> & {
    invokeFunction?: IncludedWarmer | LazyLoadedOverride<Warmer>;
  };

  /**
   * Override the default revalidate function
   * By default, works for lambda and on SQS event.
   * Supports only node runtime
   */
  revalidate?: DefaultFunctionOptions<
    { host: string; url: string; type: "revalidate" },
    { type: "revalidate" }
  >;

  /**
   * Override the default revalidate function
   * By default, works on lambda and for S3 key.
   * Supports only node runtime
   */
  imageOptimization?: DefaultFunctionOptions & {
    /**
     * The image loader is used to load the image from the source.
     * @default "s3"
     */
    loader?: IncludedImageLoader | LazyLoadedOverride<ImageLoader>;
  };

  /**
   * Override the default initialization function
   * By default, works for lambda and on SQS event.
   * Supports only node runtime
   */
  initializationFunction?: DefaultFunctionOptions & {
    tagCache?: "dynamodb" | LazyLoadedOverride<TagCache>;
  };

  /**
   * Dangerous options. This break some functionnality but can be useful in some cases.
   */
  dangerous?: DangerousOptions;
  /**
   * The command to build the Next.js app.
   * @default `npm run build`, `yarn build`, or `pnpm build` based on the lock file found in the app's directory or any of its parent directories.
   * @example
   * ```ts
   * build({
   *   buildCommand: "pnpm custom:build",
   * });
   * ```
   */
  buildCommand?: string;
  /**
   * The path to the target folder of build output from the `buildCommand` option (the path which will contain the `.next` and `.open-next` folders). This path is relative from the current process.cwd().
   * @default "."
   */
  buildOutputPath?: string;
  /**
   * The path to the root of the Next.js app's source code. This path is relative from the current process.cwd().
   * @default "."
   */
  appPath?: string;
  /**
   * The path to the package.json file of the Next.js app. This path is relative from the current process.cwd().
   * @default "."
   */
  packageJsonPath?: string;
  /**
   * **Advanced usage**
   * If you use the edge runtime somewhere (either in the middleware or in the functions), we compile 2 versions of the open-next.config.ts file.
   * One for the node runtime and one for the edge runtime.
   * This option allows you to specify the externals for the edge runtime used in esbuild for the compilation of open-next.config.ts
   * It is especially useful if you use some custom overrides only in node
   * @default []
   */
  edgeExternals?: string[];
}
