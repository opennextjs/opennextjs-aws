import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@example/shared", "react", "react-dom"],
  i18n: {
    locales: ["en", "nl"],
    defaultLocale: "en",
  },
  cleanDistDir: true,
  reactStrictMode: true,
  output: "standalone",
  // outputFileTracingRoot: "../sst",
  eslint: {
    ignoreDuringBuilds: true,
  },
  headers: async () => [
    {
      source: "/",
      headers: [
        {
          key: "x-custom-header",
          value: "my custom header value",
        },
      ],
    },
  ],
  rewrites: async () => [
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
  redirects: async () => [
    {
      source: "/next-config-redirect-without-locale-support/",
      destination: "https://opennext.js.org/",
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
  poweredByHeader: true,
};

export default nextConfig;
