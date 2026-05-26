import { OpenNextConfig } from "./open-next-config";

export interface SplittedFunctionOptions {
  /**
   * Routes that map to this function.
   * Can be exact paths (e.g., 'pages/app/index') or patterns using Next.js dynamic syntax (e.g., 'pages/app/:path*').
   * Patterns will match any request path that matches the pattern.
   */
  routes?: string[];
  /**
   * The name of the function as deployed.
   */
  name?: string;
  /**
   * Override the runtime for this function.
   */
  runtime?: "nodejs" | "edge";
  /**
   * Additional environment variables for this function.
   */
  environment?: Record<string, string>;
  /**
   * Memory size in MB for this function.
   */
  memory?: number;
  /**
   * Timeout in seconds for this function.
   */
  timeout?: number;
}

export interface SplittedFunction {
  pattern: string;
  options: SplittedFunctionOptions;
}

export interface SplitConfig {
  functions?: Record<string, SplittedFunction>;
}

export function resolveSplitConfig(config: OpenNextConfig): SplitConfig {
  return config.split ?? {};
}
