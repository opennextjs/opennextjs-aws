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
    {
      source: "/condition-headers/:value",
      has: [
        {
          type: "query",
          key: "tenant",
          value: "(?<value>.*)",
        },
        { type: "query", key: "my-query" },
        { type: "query", key: "items" },
      ],
      missing: [
        {
          type: "query",
          key: "blocked",
          value: "(?<value>.*)",
        },
      ],
      headers: [
        { key: "x-:value", value: ":myquery" },
        { key: "x-items", value: ":items*" },
        {
          key: "x-route-url",
          value: "https://example.com/path?tenant=:value&next=(literal)+*",
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
    {
      source: "/condition-catchall/:path*",
      destination: "/:path*",
    },
    {
      source: "/monitoring-tunnel",
      destination:
        "/api/query?organizationId=:organizationId&projectId=:projectId",
      has: [
        {
          type: "query",
          key: "o",
          value: "(?<organizationId>\\d*)",
        },
        {
          type: "query",
          key: "p",
          value: "(?<projectId>\\d*)",
        },
      ],
    },
    {
      source: "/condition-repeated",
      destination: "/api/query?selected=:selected",
      has: [
        {
          type: "query",
          key: "items",
          value: "(?<selected>.*)",
        },
      ],
    },
    {
      source: "/condition-value-less",
      destination: "/api/query?selected=:items*",
      has: [{ type: "query", key: "items" }],
    },
    {
      source: "/condition-host",
      destination: "/api/dynamic/:host",
      has: [{ type: "host", value: ".+" }],
    },
    {
      source: "/condition-missing/:value",
      destination: "/api/dynamic/:value",
      missing: [
        {
          type: "query",
          key: "blocked",
          value: "(?<value>.*)",
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
    {
      source: "/protocol-redirect/:path*",
      destination: "https://localhost:3002/:path*",
      permanent: false,
      has: [
        {
          type: "header",
          key: "x-protocol",
          value: "http",
        },
      ],
    },
  ],
  trailingSlash: true,
  poweredByHeader: true,
};

export default nextConfig;
