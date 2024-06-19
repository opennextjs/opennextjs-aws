/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  cleanDistDir: true,
  swcMinify: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        hostname: "**.unsplash.com",
      },
    ],
  },
};

module.exports = nextConfig;
