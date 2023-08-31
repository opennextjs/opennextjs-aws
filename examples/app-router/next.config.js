/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  output: "standalone",
  transpilePackages: ["@example/shared"],
  outputFileTracing: "../sst",
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
