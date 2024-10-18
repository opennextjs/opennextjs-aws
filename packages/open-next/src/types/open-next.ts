import type { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";

import type { StreamCreator } from "http/index.js";

import type { WarmerEvent, WarmerResponse } from "../adapters/warmer-function";
import type { IncrementalCache } from "../cache/incremental/types";
import type { TagCache } from "../cache/tag/types";
import type { Queue } from "../overrides/queue/types";

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

export type OpenNextHandler<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> = (event: E, responseStream?: StreamCreator) => Promise<R>;

export type Converter<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> = BaseOverride & {
  convertFrom: (event: any) => Promise<E>;
  convertTo: (result: R, originalRequest?: any) => Promise<any>;
};

export type WrapperHandler<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> = (
  handler: OpenNextHandler<E, R>,
  converter: Converter<E, R>,
) => Promise<(...args: any[]) => any>;

export type Wrapper<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> = BaseOverride & {
  wrapper: WrapperHandler<E, R>;
  supportStreaming: boolean;
  edgeRuntime?: boolean;
};

export type Warmer = BaseOverride & {
  invoke: (warmerId: string) => Promise<void>;
};

export type ImageLoader = BaseOverride & {
  load: (url: string) => Promise<{
    body?: Readable;
    contentType?: string;
    cacheControl?: string;
  }>;
};

export interface Origin {
  host: string;
  protocol: "http" | "https";
  port?: number;
  customHeaders?: Record<string, string>;
}
export type OriginResolver = BaseOverride & {
  resolve: (path: string) => Promise<Origin | false>;
};

export type IncludedWrapper =
  | "aws-lambda"
  | "aws-lambda-streaming"
  | "node"
  | "cloudflare";

export type IncludedConverter =
  | "aws-apigw-v2"
  | "aws-apigw-v1"
  | "aws-cloudfront"
  | "edge"
  | "node"
  | "sqs-revalidate"
  | "dummy";

export type IncludedQueue = "sqs" | "sqs-lite";

export type IncludedIncrementalCache = "s3" | "s3-lite";

export type IncludedTagCache = "dynamodb" | "dynamodb-lite";

export type IncludedImageLoader = "s3" | "host";

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
    originResolver?: "pattern-env" | LazyLoadedOverride<OriginResolver>;
  };

  /**
   * Override the default warmer
   * By default, works for lambda only.
   * If you override this, you'll need to handle the warmer event in the wrapper
   * @default undefined
   */
  warmer?: DefaultFunctionOptions<WarmerEvent, WarmerResponse> & {
    invokeFunction: "aws-lambda" | LazyLoadedOverride<Warmer>;
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
    /**
     * @default "arm64"
     */
    arch?: "x64" | "arm64";
    /**
     * @default "18"
     */

    nodeVersion?: "18" | "20";
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
