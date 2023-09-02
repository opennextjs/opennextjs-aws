/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@example/shared"],
  output: "standalone",
  outputFileTracing: "../sst",
  experimental: {
    serverActions: true,
  },
  headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "e2e-headers",
            value: "next.config.js",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
