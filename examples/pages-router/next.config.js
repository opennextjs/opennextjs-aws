/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@example/shared"],
  cleanDistDir: true,
  reactStrictMode: true,
  output: "standalone",
  outputFileTracing: "../sst",
  eslint: {
    ignoreDuringBuilds: true,
  },
  rewrites: () => [
    { source: "/rewrite", destination: "/" },
    {
      source: "/rewriteUsingQuery",
      destination: "/:destination/",
      has: [
        {
          type: "query",
          key: "d",
          value: "(?<destination>\\w+)",
        },
      ],
    },
  ],
  redirects: [
    {
      source: "/next-config-redirect-without-locale-support",
      destination: "https://open-next.js.org/",
      permanent: false,
      basePath: false,
      locale: false,
    },
  ],
  trailingSlash: true,
};

module.exports = nextConfig;
