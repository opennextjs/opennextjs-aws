import fs from "node:fs";
import path from "node:path";


type ImageLoaderProps = {
    src: string;
    width: number;
    quality?: number;
};
type ImageLoaderPropsWithConfig = ImageLoaderProps & {
    config: Readonly<ImageConfig>;
};
type RemotePattern = {
    protocol?: 'http' | 'https';
    hostname: string;
    port?: string;
    pathname?: string;
};
declare type ImageFormat = 'image/avif' | 'image/webp';

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
    contentDispositionType: 'inline' | 'attachment';
    remotePatterns: RemotePattern[];
    unoptimized: boolean;
};
type ImageConfig = Partial<ImageConfigComplete>;

// NOTE: add more next config typings as they become relevant
interface NextConfig {
  experimental: {
    serverActions?: boolean
  },
  images: ImageConfig
}

export function setNodeEnv(config: NextConfig) {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "production";
  // NOTE: 13.2 and above requires "__NEXT_PRIVATE_PREBUNDLED_REACT" to be explicitly set
  process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = config.experimental.serverActions ? 'experimental' : 'next';
}


export function loadConfig(nextDir: string): NextConfig {
  const filePath = path.join(nextDir, "required-server-files.json");
  const json = fs.readFileSync(filePath, "utf-8");
  const { config } = JSON.parse(json);
  return config satisfies NextConfig;
}
