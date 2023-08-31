/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@example/shared"],
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
