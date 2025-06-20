// NOTE: add more next config typings as they become relevant

import type { IncomingMessage, OpenNextNodeResponse } from "http/index.js";

import type { InternalEvent } from "./open-next";

type RemotePattern = {
  protocol?: "http" | "https";
  hostname: string;
  port?: string;
  pathname?: string;
};
declare type ImageFormat = "image/avif" | "image/webp";

type ImageConfigComplete = {
  deviceSizes: number[];
  imageSizes: number[];
  path: string;
  loaderFile: string;
  domains: string[];
  disableStaticImages: boolean;
  minimumCacheTTL: number;
  formats: ImageFormat[];
  dangerouslyAllowSVG: boolean;
  contentSecurityPolicy: string;
  contentDispositionType: "inline" | "attachment";
  remotePatterns: RemotePattern[];
  unoptimized: boolean;
};
type ImageConfig = Partial<ImageConfigComplete>;

export type RouteHas =
  | {
      type: "header" | "query" | "cookie";
      key: string;
      value?: string;
    }
  | {
      type: "host";
      key?: undefined;
      value: string;
    };
export type Rewrite = {
  source: string;
  destination: string;
  basePath?: false;
  locale?: false;
  has?: RouteHas[];
  missing?: RouteHas[];
};
export type Header = {
  source: string;
  regex: string;
  basePath?: false;
  locale?: false;
  headers: Array<{
    key: string;
    value: string;
  }>;
  has?: RouteHas[];
  missing?: RouteHas[];
};

export interface DomainLocale {
  defaultLocale: string;
  domain: string;
  http?: true;
  locales: readonly string[];
}

export interface i18nConfig {
  locales: string[];
  defaultLocale: string;
  domains?: DomainLocale[];
  localeDetection?: false;
}
export interface NextConfig {
  basePath?: string;
  trailingSlash?: boolean;
  skipTrailingSlashRedirect?: boolean;
  i18n?: i18nConfig;
  experimental: {
    serverActions?: boolean;
    appDir?: boolean;
    optimizeCss?: boolean;
  };
  images: ImageConfig;
  poweredByHeader?: boolean;
  serverExternalPackages?: string[];
  deploymentId?: string;
}

export interface RouteDefinition {
  page: string;
  regex: string;
}

export interface DataRouteDefinition {
  page: string;
  dataRouteRegex: string;
  routeKeys?: string;
}

export interface RewriteDefinition {
  source: string;
  destination: string;
  has?: RouteHas[];
  missing?: RouteHas[];
  regex: string;
  locale?: false;
}

export interface RedirectDefinition extends RewriteDefinition {
  internal?: boolean;
  statusCode?: number;
}

export interface RoutesManifest {
  basePath?: string;
  dynamicRoutes: RouteDefinition[];
  staticRoutes: RouteDefinition[];
  dataRoutes: DataRouteDefinition[];
  rewrites:
    | {
        beforeFiles: RewriteDefinition[];
        afterFiles: RewriteDefinition[];
        fallback: RewriteDefinition[];
      }
    | RewriteDefinition[];
  redirects: RedirectDefinition[];
  headers?: Header[];
  i18n?: {
    locales: string[];
  };
}

export interface MiddlewareInfo {
  files: string[];
  paths?: string[];
  name: string;
  page: string;
  matchers: {
    regexp: string;
    originalSource: string;
  }[];
  wasm: {
    filePath: string;
    name: string;
  }[];
  assets: {
    filePath: string;
    name: string;
  }[];
}

export interface MiddlewareManifest {
  sortedMiddleware: string[];
  middleware: {
    [key: string]: MiddlewareInfo;
  };
  functions: { [key: string]: MiddlewareInfo };
  version: number;
}

export interface PrerenderManifest {
  routes: Record<
    string,
    {
      // TODO: add the rest when needed for PPR
      initialRevalidateSeconds: number | false;
    }
  >;
  dynamicRoutes: {
    [route: string]: {
      routeRegex: string;
      fallback: string | false | null;
      dataRouteRegex: string;
    };
  };
  preview: {
    previewModeId: string;
  };
}

export type Options = {
  internalEvent: InternalEvent;
  buildId: string;
  isExternalRewrite?: boolean;
};
export type PluginHandler = (
  req: IncomingMessage,
  res: OpenNextNodeResponse,
  options: Options,
) => Promise<OpenNextNodeResponse | undefined>;

export interface FunctionsConfigManifest {
  version: number;
  functions: Record<
    string,
    {
      maxDuration?: number | undefined;
      runtime?: "nodejs";
      matchers?: Array<{
        regexp: string;
        originalSource: string;
        has?: Rewrite["has"];
        missing?: Rewrite["has"];
      }>;
    }
  >;
}
