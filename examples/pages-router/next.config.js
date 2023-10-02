/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@example/shared"],
  cleanDistDir: true,
  reactStrictMode: true,
  output: "standalone",
  outputFileTracing: "../sst",
};

module.exports = nextConfig;
