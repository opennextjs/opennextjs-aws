/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@example/shared"],
  i18n: {
    locales: ["en", "nl"],
    defaultLocale: "en",
  },
  cleanDistDir: true,
  reactStrictMode: true,
  output: "standalone",
  outputFileTracing: "../sst",
  eslint: {
    ignoreDuringBuilds: true,
  },
  rewrites: () => [
    { source: "/rewrite", destination: "/", locale: false },
    {
      source: "/rewriteUsingQuery",
      destination: "/:destination/",
      locale: false,
      has: [
        {
          type: "query",
          key: "d",
          value: "(?<destination>\\w+)",
        },
      ],
    },
  ],
  trailingSlash: true,
};

module.exports = nextConfig;
