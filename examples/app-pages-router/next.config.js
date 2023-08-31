/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  output: "standalone",
  transpilePackages: ["@example/shared"],
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
