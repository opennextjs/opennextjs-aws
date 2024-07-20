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
  redirects: () => [
    {
      source: "/next-config-redirect-without-locale-support/",
      destination: "https://open-next.js.org/",
      permanent: false,
      basePath: false,
      locale: false,
    },
    {
      source: "/redirect-with-locale/",
      destination: "/ssr/",
      permanent: false,
    },
  ],
  trailingSlash: true,
};

module.exports = nextConfig;
