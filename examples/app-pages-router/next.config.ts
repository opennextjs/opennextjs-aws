import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cleanDistDir: true,
  output: "standalone",
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
