import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cleanDistDir: true,
  transpilePackages: ["@example/shared"],
  output: "standalone",
  experimental: {
    // Exercises the non-inlined segment layout (/_head, /_index, per-layout segments)
    // against the cache interceptor. app-pages-router covers the inlined default.
    prefetchInlining: false,
  },
  // outputFileTracingRoot: "../sst",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "opennext.js.org",
      },
    ],
  },
  redirects: async () => {
    return [
      {
        source: "/next-config-redirect-missing",
        destination: "/config-redirect?missing=true",
        permanent: true,
        missing: [{ type: "cookie", key: "missing-cookie" }],
      },
      {
        source: "/next-config-redirect-not-missing",
        destination: "/config-redirect?missing=true",
        permanent: true,
        missing: [{ type: "cookie", key: "from" }], // middleware sets this cookie
      },
      {
        source: "/next-config-redirect-has",
        destination: "/config-redirect?has=true",
        permanent: true,
        has: [{ type: "cookie", key: "from" }],
      },
      {
        source: "/next-config-redirect-has-with-value",
        destination: "/config-redirect?hasWithValue=true",
        permanent: true,
        has: [{ type: "cookie", key: "from", value: "middleware" }],
      },
      {
        source: "/next-config-redirect-has-with-bad-value",
        destination: "/config-redirect?hasWithBadValue=true",
        permanent: true,
        has: [{ type: "cookie", key: "from", value: "wrongvalue" }],
      },
      {
        source: "/next-config-redirect-without-locale-support",
        destination: "https://opennext.js.org/",
        permanent: false,
        basePath: false,
        locale: false,
      },
      {
        source: "/next-config-redirect-encoding",
        destination: "/config-redirect/dest",
        permanent: false,
      },
    ];
  },
  /**
   * Defines rewrite fixtures exercised by the App Router E2E suite.
   *
   * @return The application rewrite definitions
   */
  rewrites: async () => {
    return {
      beforeFiles: [
        {
          source: "/@:org/:space/:path*",
          destination: "/orgs/:org/s/:space/:path*",
        },
      ],
      afterFiles: [
        {
          source: "/search-query-rewrite",
          destination: "/search-query",
        },
        {
          source: "/search-query-destination-rewrite",
          destination:
            "/search-query?destination=hello%252Fworld&destination=a%3Db&plus=%2B&bare",
        },
      ],
    };
  },
  async headers() {
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

export default nextConfig;
