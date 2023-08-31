/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@example/shared"],
  reactStrictMode: true,
  output: "standalone",
  outputFileTracing: "../sst",
};

module.exports = nextConfig;
