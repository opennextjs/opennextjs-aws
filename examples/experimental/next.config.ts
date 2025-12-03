import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cleanDistDir: true,
  output: "standalone",
  cacheComponents: true,
};

export default nextConfig;
