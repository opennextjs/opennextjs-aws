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
    { source: "/rewriteWithQuery", destination: "/api/query?q=1" },
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
    {
      source: "/external-on-image",
      destination: "https://opennext.js.org/share.png",
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
