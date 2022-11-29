/** @type {import('next').NextConfig} */

const isGithubActions = process.env.GITHUB_ACTIONS || false

let assetPrefix = ''
let basePath = '/'

if (isGithubActions) {
  // trim off `<owner>/`
  const repo = process.env.GITHUB_REPOSITORY.replace(/.*?\//, '')

  assetPrefix = `/${repo}/`
  basePath = `/${repo}`
}

const nextConfig = {
  images: {
    unoptimized: true,
  },

  swcMinify: true,
  reactStrictMode: true,

  basePath: basePath,
  assetPrefix: assetPrefix,
}

module.exports = nextConfig
