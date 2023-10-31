import { InternalEvent } from "../event-mapper";

export interface DangerousOptions {
  /**
   * The dynamo db cache is used for revalidateTags and revalidatePath.
   * @default false
   */
  disableDynamoDBCache?: boolean;
  /**
   * The incremental cache is used for ISR and SSG.
   * Disable this only if you use only SSR
   * @default false
   */
  disableIncrementalCache?: boolean;
}

type LazyLoadedOverride<T> = () => Promise<T>;

type Adapter = {
  convertFrom: (event: any) => InternalEvent;
  convertTo: (result: any) => any;
};

type Handler = <Return>(...args: any[]) => Return;

//TODO: properly type this
type IncrementalCache = {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
};

type TagCache = {
  getByTag(tag: string): Promise<string[]>;
  getByPath(path: string): Promise<string[]>;
  getLastModified(path: string, lastModified?: number): Promise<number>;
  writeTags(tags: { tag: string; path: string }): Promise<void>;
};

type Queue = {
  send(message: any): Promise<void>;
};

interface OverrideOptions {
  /**
   * This is the main entrypoint of your app.
   * @default "aws-lambda"
   */
  handler?:
    | "aws-lambda"
    | "aws-lambda-streaming"
    | "docker"
    | LazyLoadedOverride<Handler>;

  /**
   * This code convert the event to InternalEvent and InternalResult to the expected output.
   * @default "aws-apigw-v2"
   */
  adapter?:
    | "aws-apigw-v2"
    | "aws-apigw-v1"
    | "aws-cloudfront"
    | "docker"
    | LazyLoadedOverride<Adapter>;

  /**
   * Add possibility to override the default s3 cache. Used for fetch cache and html/rsc/json cache.
   * @default "s3"
   */
  incrementalCache?: "s3" | LazyLoadedOverride<IncrementalCache>;

  /**
   * Add possibility to override the default tag cache. Used for revalidateTags and revalidatePath.
   * @default "dynamodb"
   */
  tagCache?: "dynamodb" | LazyLoadedOverride<TagCache>;

  /**
   * Add possibility to override the default queue. Used for isr.
   * @default "sqs"
   */
  queue?: "sqs" | LazyLoadedOverride<Queue>;
}

interface FunctionOptions {
  /**
   * TODO: implement edge runtime
   * @default "node"
   */
  runtime?: "node" | "edge";
  /**
   * Here you should specify all the routes you want to use.
   * If not provided, all the routes will be used.
   * @default []
   */
  routes?: string[];
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
   * Enable streaming mode.
   * @default false
   */
  streaming?: boolean;
  /**
   * Enable overriding the default lambda.
   */
  override?: OverrideOptions;
}

export interface BuildOptions {
  functions: {
    default: Omit<FunctionOptions, "routes">;
    [key: string]: FunctionOptions;
  };
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
  /**
   * Dangerous options. This break some functionnality but can be useful in some cases.
   */
  dangerous?: DangerousOptions;
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
}
