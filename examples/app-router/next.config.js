/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  cleanDistDir: true,
  transpilePackages: ["@example/shared"],
  output: "standalone",
  outputFileTracing: "../sst",
  experimental: {
    serverActions: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "open-next.js.org",
      },
    ],
  },
  redirects: () => {
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
        destination: "https://open-next.js.org/",
        permanent: false,
        basePath: false,
        locale: false,
      },
    ];
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
