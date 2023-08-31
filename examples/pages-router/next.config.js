/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@example/shared"],
  reactStrictMode: true,
  outputFileTracing: "../sst",
};

module.exports = nextConfig;
