<p align="center">
  <a href="https://open-next.js.org">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/public/logo-dark.svg">
      <img alt="OpenNext" src="docs/public/logo-light.svg" width="300" />
    </picture>
  </a>
</p>
<p align="center">
  <a href="https://sst.dev/discord"><img alt="Discord" src="https://img.shields.io/discord/983865673656705025?style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/open-next"><img alt="npm" src="https://img.shields.io/npm/v/open-next.svg?style=flat-square" /></a>
</p>

---

OpenNext takes the Next.js build output and converts it into a package that can be deployed to any functions as a service platform.

## Features

OpenNext aims to support all Next.js 13 features. Some features are work in progress. Please open a [new issue](/issues/new) to let us know!

- [x] API routes
- [x] Dynamic routes
- [x] Static site generation (SSG)
- [x] Server-side rendering (SSR)
- [x] Incremental static regeneration (ISR)
- [ ] Image optimization (work in progress)
- [ ] Middleware (work in progress)

## Quick start

1. Naviate to your Next.js app

   ```bash
   cd my-next-app
   ```

2. Build the app

   ```bash
   npx open-next@latest build
   ```

   This will generate an `.open-next` directory with the following bundles:

   ```bash
   my-next-app/
     .open-next/
       assets/                -> Static assets to upload to an S3 Bucket
       server-function/       -> Handler code for server Lambda Function
       middleware-function/   -> Handler code for middleware Lambda@Edge Function
   ```

## Recommeded infrastructure

OpenNext does not create the underlying infrastructure. You can create the infrastructure for your app with your preferred tool — SST, CDK, Serverless Framework, Terraform, etc.

This is the recommended setup.

<p align="center">
  <img alt="Architecture" src="docs/public/architecture.png" width="800" />
</p>

A few AWS resources need to be created:

- An S3 bucket to host static assets from `.open-next/assets`.
- A Lambda function handling server and API requests.
- A Lambda function handling image optimization requests.
- A CloudFront distribution that routes incoming requests based on URL path.
- And finally a Lambda@Edge function that runs the middleware before requests hit the CloudFront.

## How does OpenNext work?

When you call `npx open-next build`, behind the scenes OpenNext builds your Next.js app using the `@vercel/next` package. This package does 2 things:

- It calls `next build` with the [`minimalMode`](https://github.com/vercel/next.js/discussions/29801) flag. This flag disables running middleware in the server code.

- Instead, it bundles the middleware separately. This allows us to deploy middleware to edge locations.

Then `open-next` transforms `@vercel/next`'s build output into a format that can be deployed to AWS. The following steps are performed:

1. Creates a `.open-next` directory in the user's Next.js app.

1. Bundles the middleware handler with the [middleware adapter](/cli/assets/middleware-adapter.js). And outputs the handler file into `.open-next/middleware-function`.

1. Bundles the server handler with the [server adapter](/cli/assets/server-adapter.cjs). And outputs the handler file into `.open-next/server-function`. Also copies over other server assets from `.next/standalone`.

1. Bundles the static assets into `.open-next/assets` with the following content:

- `public`
- `.next/BUILD_ID`
- `.next/static`

## Example

In the `example` folder, you can find a Next.js feature test app. Here's a link deployed using SST's [`NextjsSite`](https://docs.sst.dev/constructs/NextjsSite) construct. It contains a handful of pages. Each page aims to test a single Next.js feature.

## Debugging

You can find the server log in the AWS CloudWatch console of the **region you deployed to**.

You can find the middleware log in the AWS CloudWatch console of the **region you are physically close to**. For example, if you deployed your app to `us-east-1` and you are in London, it's likely you will find the logs in `eu-west-2`.

## Opening an issue

Create a PR and add a new page to the benchmark app in `example` with the issue.

## FAQ

#### Why use the `@vercel/next` package for building the Next.js app?

The `next build` command generates a server function that runs the middleware. With this setup, if you use middleware for static pages, these pages cannot be cached. If cached, CDN (CloudFront) will send back the cached response without calling the origin (server Lambda function). To ensure the middleware is invoked on every request, caching is always disabled.

Vercel deploys the middleware code to edge functions, which gets invoked before the request reaches the CDN. This way, static pages can be cached. On request, the middleware gets called, and then the CDN can send back the cached response.

OpenNext is designed to adopt the same setup as Vercel. And building using `@vercel/next` allows us to separate the middleware code from the server code.

---

Maintained by [SST](https://sst.dev). Join our community: [Discord](https://sst.dev/discord) | [YouTube](https://www.youtube.com/c/sst-dev) | [Twitter](https://twitter.com/SST_dev)
