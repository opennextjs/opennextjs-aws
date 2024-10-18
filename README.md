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
  <a href="https://www.npmjs.com/package/@opennextjs/aws"><img alt="npm" src="https://img.shields.io/npm/v/@opennextjs/aws.svg?style=flat-square" /></a>
</p>

---

<p align="center">
  <a href="https://open-next.js.org/">Docs</a> |
  <a href="#example">Example</a> 
</p>

OpenNext takes the Next.js build output and converts it into a package that can be deployed to any functions as a service platform.

## Features

OpenNext aims to support all Next.js 14 features. Some features are work in progress. Please open a [new issue](/issues/new) to let us know!

- [x] App & Pages Router
- [x] API routes
- [x] Dynamic routes
- [x] Static site generation (SSG)
- [x] Server-side rendering (SSR)
- [x] Incremental static regeneration (ISR)
- [x] Middleware
- [x] Server actions
- [x] Image optimization
- [x] [NextAuth.js](https://next-auth.js.org)
- [x] Running at edge
- [x] No cold start

## Who is using OpenNext?

[Gymshark UK](https://uk.gymshark.com), [Udacity](https://engineering.udacity.com/deploying-next-js-on-the-edge-with-sst-is-sst-the-game-changer-its-claimed-to-be-1f05a0abc27c), [TUDN](https://www.tudn.com), [NHS England](https://github.com/nhs-england-tools/terraform-aws-opennext) & [Nike](https://about.nike.com)



## Example

In the `example` folder, you can find a Next.js benchmark app. It contains a variety of pages that each test a single Next.js feature. The app is deployed to both Vercel and AWS using [SST](https://docs.sst.dev/start/nextjs).

AWS link: https://d1gwt3w78t4dm3.cloudfront.net

Vercel link: https://open-next.vercel.app

## Configuration

### Environment variables

- `AWS_SDK_DYNAMODB_MAX_ATTEMPTS`: The maximum number of times requests that encounter retryable failures should be attempted for DynamoDB. Defaults to 3.
- `AWS_SDK_S3_MAX_ATTEMPTS`: The maximum number of times requests that encounter retryable failures should be attempted for S3. Defaults to 3.
- `DYNAMO_BATCH_WRITE_COMMAND_CONCURRENCY`: The number of concurrent batch write commands to DynamoDB. Defaults to 4 in an effort to leave plenty of DynamoDB write request capacity for the production load.

### Debug mode

OpenNext can be executed in debug mode by setting the environment variable `OPEN_NEXT_DEBUG=true` before your build.

This will output A LOT of additional logs to the console. This also disable minifying in esbuild, and add source maps to the output. This can result in code that might be up to 2-3X larger than the production build. Do **not** enable this in production.


## Contribute

To run `OpenNext` locally:

1. Clone this repository.
1. Build `open-next`:
   ```bash
   cd packages/open-next
   pnpm build
   ```
1. Run `open-next` in watch mode:
   ```bash
   pnpm dev
   ```
1. Now, you can make changes in `open-next` and build your Next.js app to test the changes.
   ```bash
   cd path/to/my/nextjs/app
   path/to/open-next/packages/open-next/dist/index.js build
   ```

## Acknowledgements

We are grateful for the projects that inspired OpenNext and the amazing tools and libraries developed by the community:

- [nextjs-lambda](https://github.com/sladg/nextjs-lambda) by [Jan](https://github.com/sladg) for serving as inspiration for packaging Next.js's standalone output to Lambda.
- [CDK NextJS](https://github.com/jetbridge/cdk-nextjs/) by [JetBridge](https://github.com/jetbridge) for its contribution to the deployment architecture of a Next.js application on AWS.
- [serverless-http](https://github.com/dougmoscrop/serverless-http) by [Doug Moscrop](https://github.com/dougmoscrop) for developing an excellent library for transforming AWS Lambda events and responses.
- [serverless-nextjs](https://github.com/serverless-nextjs/serverless-next.js) by [Serverless Framework](https://github.com/serverless) for paving the way for serverless Next.js applications on AWS.

Special shoutout to [@khuezy](https://github.com/khuezy) and [@conico974](https://github.com/conico974) for their outstanding contributions to the project.

---

Maintained by [SST](https://sst.dev). Join our community: [Discord](https://sst.dev/discord) | [YouTube](https://www.youtube.com/c/sst-dev) | [Twitter](https://twitter.com/SST_dev)
