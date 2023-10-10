/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@example/shared"],
  cleanDistDir: true,
  reactStrictMode: true,
  output: "standalone",
  outputFileTracing: "../sst",
  rewrites: () => [{ source: "/rewrite", destination: "/" }],
  trailingSlash: true,
};

module.exports = nextConfig;
