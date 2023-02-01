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

<p align="center">
  <a href="https://open-next.js.org/">Website</a> |
  <a href="#quick-start">Quick start</a> |
  <a href="#recommended-infrastructure-on-aws">Infrastructure</a> |
  <a href="#example">Example</a> |
  <a href="#contribute">Contribute</a> |
  <a href="#faq">FAQ</a>
</p>

OpenNext takes the Next.js build output and converts it into a package that can be deployed to any functions as a service platform.

## Features

OpenNext aims to support all Next.js 13 features. Some features are work in progress. Please open a [new issue](/issues/new) to let us know!

- [x] API routes
- [x] Dynamic routes
- [x] Static site generation (SSG)
- [x] Server-side rendering (SSR)
- [x] Incremental static regeneration (ISR)
- [x] Middleware
- [x] Image optimization

## Quick start

1. Navigate to your Next.js app

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
       assets/                        -> Static files to upload to an S3 Bucket
       server-function/               -> Handler code for server Lambda Function
       middleware-function/           -> Handler code for middleware Lambda@Edge Function
       image-optimization-function/   -> Handler code for image optimization Lambda Function
   ```

   If your Next.js app does not use [middleware](https://nextjs.org/docs/advanced-features/middleware), `middleware-function` will not be generated.

3. Add `.open-next` to your `.gitignore` file
   ```
   # OpenNext
   /.open-next/
   ```

## How does OpenNext work?

When calling `open-next build`, OpenNext **builds the Next.js app** using the `@vercel/next` package. It then **transforms the build output** to a format that can be deployed to AWS.

#### Building the Next.js app

OpenNext imports the `@vercel/next` package to do the build. The package internally calls `next build` with the [`minimalMode`](https://github.com/vercel/next.js/discussions/29801) flag. This flag disables running middleware in the server code, and instead bundles the middleware code separately. This allows us to deploy middleware to edge locations, similar to how middleware is deployed on Vercel.

#### Transforming the build output

The build output is then transformed into a format that can be deployed to AWS. Files in `assets/` are ready to be uploaded to AWS S3. And the function code is wrapped inside Lambda handlers, ready to be deployed to AWS Lambda and Lambda@Edge.

## Recommended infrastructure on AWS

OpenNext does not create the underlying infrastructure. You can create the infrastructure for your app with your preferred tool — SST, AWS CDK, Terraform, Serverless Framework, etc.

This is the recommended setup.

<p align="center">
  <img alt="Architecture" src="docs/public/architecture.png" width="800" />
</p>

Here are the recommended configurations for each AWS resource.

#### S3 bucket

Create an S3 bucket and upload the content in the `.open-next/assets` folder to the root of the bucket. For example, the file `.open-next/assets/favicon.ico` should be uploaded to `/favicon.ico` at the root of the bucket.

There are two types of files in the `.open-next/assets` folder:

**Hashed files**

These are files with a hash component in the file name. Hashed files are be found in the `.open-next/assets/_next` folder, such as `.open-next/assets/_next/static/css/0275f6d90e7ad339.css`. The hash values in the filenames are guaranteed to change when the content of the files is modified. Therefore, hashed files should be cached both at the CDN level and at the browser level. When uploading the hashed files to S3, the recommended cache control setting is

```
public,max-age=31536000,immutable
```

**Un-hashed files**

Other files inside the `.open-next/assets` folder are copied from your app's `public/` folder, such as `.open-next/assets/favicon.ico`. The filename for un-hashed files may remain unchanged when the content is modified. Un-hashed files should be cached at the CDN level, but not at the browser level. When the content of un-hashed files is modified, the CDN cache should be invalidated on deploy. When uploading the un-hashed files to S3, the recommended cache control setting is

```
public,max-age=0,s-maxage=31536000,must-revalidate
```

#### Image optimization function

Create a Lambda function using the code in the `.open-next/image-optimization-function` folder, with the handler `index.mjs`. Ensure that the **arm64** architecture is used.

This function handles image optimization requests when the Next.js `<Image>` component is used. The [sharp](https://www.npmjs.com/package/sharp) library, which is bundled with the function, is used to convert the image. The library is compiled against the `arm64` architecture and is intended to run on AWS Lamba Arm/Graviton2 architecture. [Learn about the better cost-performance offered by AWS Graviton2 processors.](https://aws.amazon.com/blogs/aws/aws-lambda-functions-powered-by-aws-graviton2-processor-run-your-functions-on-arm-and-get-up-to-34-better-price-performance/)

Note that the image optimization function responds with the `Cache-Control` header, so the image will be cached both at the CDN level and at the browser level.

#### Server Lambda function

Create a Lambda function using the code in the `.open-next/server-function` folder, with the handler `index.mjs`.

This function handles all other types of requests from the Next.js app, including Server-side Rendering (SSR) requests and API requests. OpenNext builds the Next.js app in **standalone** mode. The standalone mode generates a `.next` folder containing the **NextServer** class that handles requests and a `node_modules` folder with **all the dependencies** needed to run the `NextServer`. The structure looks like this:

```
  .next/              -> NextServer
  node_modules/       -> dependencies
```

The server function adapter wraps around `NextServer` and exports a handler function that supports the Lambda request and response. The `server-function` bundle looks like this:

```diff
  .next/              -> NextServer
  node_modules/       -> dependencies
+ index.mjs           -> server function adapter
```

**Monorepo**

In the case of a monorepo, the build output looks slightly different. For example, if the app is located in `packages/web`, the build output looks like this:

```
  packages/
    web/
      .next/          -> NextServer
      node_modules/   -> dependencies from root node_modules (optional)
  node_modules/       -> dependencies from package node_modules
```

In this case, the server function adapter needs to be created inside `packages/web` next to `.next/`. This is to ensure that the adapter can import dependencies from both `node_modules` folders. It is not a good practice to have the Lambda configuration coupled with the project structure, so instead of setting the Lambda handler to `packages/web/index.mjs`, we will add a wrapper `index.mjs` at the `server-function` bundle root that re-exports the adapter. The resulting structure looks like this:

```diff
  packages/
    web/
      .next/          -> NextServer
      node_modules/   -> dependencies from root node_modules (optional)
+     index.mjs       -> server function adapter
  node_modules/       -> dependencies from package node_modules
+ index.mjs           -> adapter wrapper
```

This ensures that the Lambda handler remains at `index.mjs`.

#### CloudFront distribution

Create a CloudFront distribution, and dispatch requests to their corresponding handlers (behaviors). The following behaviors are configured:

| Behavior          | Requests            | Origin                                                                                                                                | Allowed Headers                                                                                                                                                                                                               |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/_next/static/*` | Hashed static files | S3 bucket                                                                                                                             |                                                                                                                                                                                                                               |
| `/_next/image`    | Image optimization  | image optimization function                                                                                                           | `Accept`                                                                                                                                                                                                                      |
| `/_next/data/*`   | data requests       | server function                                                                                                                       | `x-op-middleware-request-headers`<br />`x-op-middleware-response-headers`<br />`x-nextjs-data`<br />`x-middleware-prefetch`<br />[see why](#workaround-pass-headers-from-middleware-function-to-server-function-aws-specific) |
| `/api/*`          | API                 | server function                                                                                                                       |                                                                                                                                                                                                                               |
| `/*`              | catch all           | server function<br />fallback to S3 bucket<br />[see why](#workaround-public-static-files-served-out-by-server-function-aws-specific) | `x-op-middleware-request-headers`<br />`x-op-middleware-response-headers`<br />`x-nextjs-data`<br />`x-middleware-prefetch`<br />[see why](#workaround-pass-headers-from-middleware-function-to-server-function-aws-specific) |

#### Middleware Lambda@Edge function (optional)

Create a Lambda function using the code in the `.open-next/middleware-function` folder, with the handler `index.mjs`. Attach this function to the `/_next/data/*` and `/*` behaviors on `viewer request`. This allows the function to run your [Middleware](https://nextjs.org/docs/advanced-features/middleware) code before the request reaches your server function, and also before cached content.

The middleware function uses the [global fetch API](https://nodejs.org/de/blog/announcements/v18-release-announce/#new-globally-available-browser-compatible-apis), which requires the function to run on the Node.js 18 runtime. [See why Node.js 18 runtime is required.](#workaround-add-headersgetall-extension-to-the-middleware-function)

Note that if middleware is not used in the Next.js app, the `middleware-function` bundle will not be generated. In this case, you do not have to create the Lambda@Edge function or configure it in the CloudFront distribution.

## Limitations and workarounds

#### WORKAROUND: `public/` static files served by the server function (AWS specific)

As mentioned in the [S3 bucket](#s3-bucket) section, files in your app's `public/` folder are static and are uploaded to the S3 bucket. Ideally, requests for these files should be handled by the S3 bucket, like so:

```
https://my-nextjs-app.com/favicon.ico
```

This requires the CloudFront distribution to have the behavior `/favicon.ico` and set the S3 bucket as the origin. However, CloudFront has a [default limit of 25 behaviors per distribution](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-web-distributions), so it is not a scalable solution to create one behavior per file.

To work around the issue, requests for `public/` files are handled by the catch all behavior `/*`. The behavior sends the request to the server function first, and if the server fails to handle the request, it will fall back to the S3 bucket.

This means that on cache miss, the request will take slightly longer to process.

#### WORKAROUND: `NextServer` does not set cache response headers for HTML pages

As mentioned in the [Server function](#server-lambda-function) section, the server function uses the `NextServer` class from Next.js' build output to handle requests. However, `NextServer` does not seem to set the correct `Cache Control` headers.

To work around the issue, the server function checks if the request is for an HTML page, and sets the `Cache Control` header to:

```
public, max-age=0, s-maxage=31536000, must-revalidate
```

#### WORKAROUND: Set `NextServer` working directory (AWS specific)

Next.js recommends using `process.cwd()` instead of `__dirname` to get the app directory. For example, consider a `posts` folder in your app with markdown files:

```
pages/
posts/
  my-post.md
public/
next.config.js
package.json
```

You can build the file path like this:

```ts
path.join(process.cwd(), "posts", "my-post.md");
```

As mentioned in the [Server function](#server-lambda-function) section, in a non-monorepo setup, the `server-function` bundle looks like:

```
.next/
node_modules/
posts/
  my-post.md    <- path is "posts/my-post.md"
index.mjs
```

In this case, `path.join(process.cwd(), "posts", "my-post.md")` resolves to the correct path.

However, when the user's app is inside a monorepo (ie. at `/packages/web`), the `server-function` bundle looks like:

```
packages/
  web/
    .next/
    node_modules/
    posts/
      my-post.md    <- path is "packages/web/posts/my-post.md"
    index.mjs
node_modules/
index.mjs
```

In this case, `path.join(process.cwd(), "posts", "my-post.md")` cannot be resolved.

To work around the issue, we change the working directory for the server function to where `.next/` is located, ie. `packages/web`.

#### WORKAROUND: Pass headers from middleware function to server function (AWS specific)

[Middleware](https://nextjs.org/docs/advanced-features/middleware) allows you to modify the request and response headers. To do this, the middleware function must be able to pass custom headers defined in your Next.js app's middleware code to the server function.

CloudFront allows you to pass all headers to the server function, but doing so also includes the `Host` header. This will cause API Gateway to reject the request. There is no way to configure CloudFront to pass **all but the `Host` header**.

To work around this issue, the middleware function JSON encodes all request headers into the `x-op-middleware-request-headers` header and all response headers into the `x-op-middleware-response-headers` header. The server function will then decode these headers.

Note that the `x-op-middleware-request-headers` and `x-op-middleware-response-headers` headers must be added to the allowed list in the CloudFront distribution's cache policy.

#### WORKAROUND: Add `Headers.getAll()` extension to the middleware function

Vercel uses the `Headers.getAll()` function in its middleware code, but this function is not part of the Node.js 18 [global fetch API](https://nodejs.org/de/blog/announcements/v18-release-announce/#new-globally-available-browser-compatible-apis). To handle this, we have two options:

1. Inject the `getAll()` function into the global fetch API.
2. Use the [`node-fetch`](https://github.com/node-fetch/node-fetch) package to polyfill the fetch API.

We decided to go with option 1 because it does not require an addition dependency and it is possible that Vercel will remove the use of the `getAll()` function in the future.

## Example

In the `example` folder, you can find a Next.js feature test app. It contains a variety of pages that each test a single Next.js feature.

Here's a link deployed using SST's [`NextjsSite`](https://docs.sst.dev/constructs/NextjsSite) construct.

## Debugging

To find the **server and image optimization** log, go to the AWS CloudWatch console in the **region you deployed to**.

To find the **middleware** log, go to the AWS CloudWatch console in the **region you are physically close to**. For example, if you deployed your app to `us-east-1` and you are visiting the app from in London, the logs are likely to be in `eu-west-2`.

## Opening an issue

To open an issue, create a pull request (PR) and add a new page to the benchmark app in `example` folder that demonstrate the issue.

## Contribute

To run `OpenNext` locally:

1. Clone this repository.
1. Build `open-next`:
   ```bash
   cd open-next
   pnpm build
   ```
1. Run `open-next` in watch mode:
   ```bash
   pnpm dev
   ```
1. Make `open-next` linkable from your Next.js app:
   ```bash
   pnpm link --global
   ```
1. Link `open-next` in your Next.js app:
   ```bash
   cd path/to/my/nextjs/app
   pnpm link --global open-next
   ```
   Now, you can make changes in `open-next` and run `pnpm open-next build` in your Next.js app to test the changes.

## FAQ

#### Why use the `@vercel/next` package for building the Next.js app?

The `next build` command generates a server function that includes the middleware code. This means that if you use middleware for static pages, these pages cannot be cached by the CDN (CloudFront). If cached, CDN will send back the cached response without calling the origin (server function). To ensure the middleware is invoked on every request, caching is always disabled.

On the other hand, Vercel deploys the middleware code to edge functions, which are invoked before the request reaches the CDN. This allows static pages can be cached, as the middleware is called before the CDN sends back a cached response.

To replicated this setup, OpenNext uses the `@vercel/next` package to build the Next.js app. This separates the middleware code from the server code, allowing for caching of static pages.

---

Maintained by [SST](https://sst.dev). Join our community: [Discord](https://sst.dev/discord) | [YouTube](https://www.youtube.com/c/sst-dev) | [Twitter](https://twitter.com/SST_dev)
