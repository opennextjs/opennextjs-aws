/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  output: "standalone",
  transpilePackages: ["@open-next/core"],
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
