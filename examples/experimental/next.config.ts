import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cleanDistDir: true,
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    ppr: "incremental",
  },
};

export default nextConfig;
