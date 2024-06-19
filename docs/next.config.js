/** @type {import('next').NextConfig} */

// let basePath = undefined;
// let assetPrefix = undefined;

///** Deploys as a directory through GitHub Actions **/
//const isGithubActions = process.env.GITHUB_ACTIONS || false
//
//if (isGithubActions) {
//  // trim off `<owner>/`
//  const repo = process.env.GITHUB_REPOSITORY.replace(/.*?\//, '')
//
//  assetPrefix = `/${repo}/`
//  basePath = `/${repo}`
//}
///** End GitHub Actions case **/

// const nextConfig = {
//   images: {
//     unoptimized: true,
//   },

//   swcMinify: true,
//   reactStrictMode: true,

//   basePath: basePath,
//   assetPrefix: assetPrefix,
// };

const withNextra = require("nextra")({
  theme: "nextra-theme-docs",
  themeConfig: "./theme.config.jsx",
});

module.exports = withNextra({
  swcMinify: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
});
