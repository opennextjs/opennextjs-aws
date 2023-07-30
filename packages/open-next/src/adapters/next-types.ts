// NOTE: add more next config typings as they become relevant

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

export interface NextConfig {
  i18n?: {
    locales: string[];
  };
  experimental: {
    serverActions?: boolean;
    appDir?: boolean;
  };
  images: ImageConfig;
}

export interface RouteDefinition {
  page: string;
  regex: string;
}

export interface RewriteMatcher {
  type: "header" | "cookie" | "query" | "host";
  key: string;
  value?: string;
}
export interface RewriteDefinition {
  source: string;
  destination: string;
  has?: RewriteMatcher[];
  missing?: RewriteMatcher[];
  regex: string;
}

export interface RedirectDefinition extends RewriteDefinition {
  internal?: boolean;
  statusCode?: number;
}

export interface RoutesManifest {
  dynamicRoutes: RouteDefinition[];
  staticRoutes: RouteDefinition[];
  rewrites: {
    beforeFiles: RewriteDefinition[];
    afterFiles: RewriteDefinition[];
    fallback: RewriteDefinition[];
  };
  redirects: RedirectDefinition[];
}
