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
  <a href="#recommeded-infrastructure-on-aws">Infrastructure</a> |
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

When calling `open-next build`, OpenNext **builds the Next.js app** using the `@vercel/next` package. And then it **transforms the build output** to a format that can be deployed to AWS.

#### Building Next.js app

OpenNext imports the `@vercel/next` package to do the build. The package internally calls `next build` with the [`minimalMode`](https://github.com/vercel/next.js/discussions/29801) flag. This flag disables running middleware in the server code. Instead, it bundles the middleware code separately. This allows us to deploy middleware to edge locations. That is similar to how middleware is deployed on Vercel.

#### Transforming build output

Then the build output gets transformed into a format that can be deployed to AWS. Files in `assets/` are ready to be uploaded to AWS S3. And function code are wrapped inside Lambda handlers. They are ready to be deployed to AWS Lambda and Lambda@Edge.

## Recommeded infrastructure on AWS

OpenNext does not create the underlying infrastructure. You can create the infrastructure for your app with your preferred tool — SST, CDK, Terraform, Serverless Framework, etc.

This is the recommended setup.

<p align="center">
  <img alt="Architecture" src="docs/public/architecture.png" width="800" />
</p>

Let's dive into the recommended configuration for each AWS resource.

#### S3 bucket

Create an S3 bucket and upload the content in `.open-next/assets` to the root of the bucket. For example, `.open-next/assets/favicon.ico` would get uploaded to `/favicon.ico` off the bucket root.

There are two types of files in `.open-next/assets`:

**Hashed files**

These are files with a hash component in the file name. Hashed files are located inside `.open-next/assets/_next`, ie. `.open-next/assets/_next/static/css/0275f6d90e7ad339.css`. The hash values in the filenames are guaranteed to change when the content of the files change. So hashed files should be cached both at the CDN level and at the browser level. When uploading the hashed files to S3, the recommended cache control setting is

```
public,max-age=31536000,immutable
```

**Un-hashed files**

Other files inside `.open-next/assets` are copied over from your app's `public/` folder, ie. `.open-next/assets/favicon.ico`. The file name for un-hashed files can remain unchanged when the content change. Un-hashed files should be cached at the CDN level, but not at the browser level. And when the content of un-hashed files change, invalidate the CDN cache on deploy. When uploading the un-hashed files to S3, the recommended cache control setting is

```
public,max-age=0,s-maxage=31536000,must-revalidate
```

#### Image optimization function

Create a Lambda function with the code from `.open-next/image-optimization-function`, and the handler is `index.mjs`.

This function handles image optimization requests when the Next.js `<Image>` component is used. The [sharp](https://www.npmjs.com/package/sharp) library is bundled with the function. And it is used to convert the image.

Note that image optimization function responds with the `Cache-Control` header, and the image will be cached both at the CDN level and at the browser level.

#### Server Lambda function

Create a Lambda function with the code from `.open-next/server-function`, and the handler is `index.mjs`.

This function handles all the other types of requests from the Next.js app, including Server-side Rendering (SSR) requests and API requests. OpenNext builds the Next.js app in the **standalone** mode. The standalone mode generates a `.next` folder containing the **NextServer** class that does the request handling. It also generates a `node_modules` folder with **all the dependencies** required to run the `NextServer`.

```
  .next/              -> NextServer
  node_modules/       -> dependencies
```

The server function adapter wraps around `NextServer` and exports a handler function that supports the Lambda request and response. The `server-function` bundle looks like:

```diff
  .next/              -> NextServer
  node_modules/       -> dependencies
+ index.mjs           -> server function adapter
```

**Monorepo**
The build output looks slightly different when the Next.js app is part of a monorepo. Imagine the app sits inside `packages/web`, the build output looks like:

```
  packages/
    web/
      .next/          -> NextServer
      node_modules/   -> dependencies from root node_modules (optional)
  node_modules/       -> dependencies from package node_modules
```

In this case, the server function adapter needs to be created inside `packages/web` next to `.next/`. This is to ensure the adapter can import dependencies from both `node_modules` folders. We could set the Lambda handler to point to `packages/web/index.mjs`, but it is a bad practice to have the Lambda configuration coupled with the project structure. Instead, we will add a wrapper `index.mjs` at the `server-function` bundle root that re-exports the adapter.

```diff
  packages/
    web/
      .next/          -> NextServer
      node_modules/   -> dependencies from root node_modules (optional)
+     index.mjs       -> server function adapter
  node_modules/       -> dependencies from package node_modules
+ index.mjs           -> adapter wrapper
```

This ensure the Lambda handler remains at `index.mjs`.

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

Create a Lambda function with the code from `.open-next/middleware-function`, and the handler is `index.mjs`. Attach it to the `/_next/data/*` and `/*` behaviors as `viewer request` edge function. This allows the function to run your [Middleware](https://nextjs.org/docs/advanced-features/middleware) code before the request hits your server function, and also before cached content.

The middleware function uses the Node.js 18 [global fetch API](https://nodejs.org/de/blog/announcements/v18-release-announce/#new-globally-available-browser-compatible-apis). It requires to run on Node.js 18 runtime. [See why Node.js 18 runtime is required.](#workaround-add-headersgetall-extension-to-the-middleware-function)

Note that if middleware is not used in the Next.js app, the `middleware-function` will not be generated. In this case, you don't have to create the Lambda@Edge function, and configure it in the CloudFront distribution.

## Limitations and workarounds

#### WORKAROUND: `public/` static files served out by server function (AWS specific)

Recall in the [S3 bucket](#s3-bucket) section, files in your app's `public/` folder are static, and are uploaded to the S3 bucket. Ideally, requests to these files should be handled by the S3 bucket. For example:

```
https://my-nextjs-app.com/favicon.ico
```

This requires the CloudFront distribution to have the behavior `/favicon.ico`, and set the S3 bucket as the origin. However, CloudFront has a [default limit of 25 behaviors per distribution](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-web-distributions). It is not a scalable solution to create 1 behavior per file.

To work around the issue, requests to `public/` files are handled by the cache all behavior `/*`. The behavior sends the request to the server function first. And if the server fails to handle the request, it will fallback to the S3 bucket.

This means on cache miss, the request will take slightly longer to process.

#### WORKAROUND: `NextServer` does not set cache response headers for HTML pages

Recall in the [Server function](#server-lambda-function) section, the server function uses the `NextServer` class from Next.js' build output to handle requests. `NextServer` does not seem to set the correct `Cache Control` headers.

To work around the issue, the server function checks if the request is to an HTML page. And it will set the `Cache Control` header:

```
public, max-age=0, s-maxage=31536000, must-revalidate
```

#### WORKAROUND: Set `NextServer` working directory (AWS specific)

Next.js recommends using `process.cwd()` instead of `__dirname` to get the app directory. Imagine you have a `posts` folder in your app with markdown files:

```
pages/
posts/
  my-post.md
public/
next.config.js
package.json
```

And you can build the file path like this:

```ts
path.join(process.cwd(), "posts", "my-post.md");
```

Recall in the [Server function](#server-lambda-function) section. In a non-monorepo setup, the `server-function` bundle looks like:

```
.next/
node_modules/
posts/
  my-post.md    <- path is "posts/my-post.md"
index.mjs
```

And `path.join(process.cwd(), "posts", "my-post.md")` resolves to the correct path.

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

And `path.join(process.cwd(), "posts", "my-post.md")` cannot be resolved.

To workaround the issue, we change the working directory for the server function to where `.next/` is located, ie. `packages/web`.

#### WORKAROUND: Pass headers from middleware function to server function (AWS specific)

[Middleware](https://nextjs.org/docs/advanced-features/middleware) allows you to modify the request and response headers. This requires the middleware function to be able to pass custom headers defined in your Next.js app's middleware code to the server function.

CloudFront lets your pass all headers to the server function. But by doing so, the `Host` header is also passed along to the server function. And API Gateway would reject the request. There is no way to configure CloudFront too pass **all but `Host` header**.

To work around the issue, the middleware function JSON encodes all request headers into the `x-op-middleware-request-headers` header. And all response headers into the `x-op-middleware-response-headers` header. The server function will then decode the headers.

Note that the `x-op-middleware-request-headers` and `x-op-middleware-response-headers` headers need to be added to CloudFront distribution's cache policy allowed list.

#### WORKAROUND: Add `Headers.getAll()` extension to the middleware function

Vercel uses the `Headers.getAll()` function in the middleware code. This function is not part of the Node.js 18 [global fetch API](https://nodejs.org/de/blog/announcements/v18-release-announce/#new-globally-available-browser-compatible-apis). We have two options:

1. Inject the `getAll()` function to the global fetch API.
2. Use the [`node-fetch`](https://github.com/node-fetch/node-fetch) package to polyfill the fetch API.

We decided to go with option 1. It does not require addition dependency. And it is likely that Vercel removes the usage of the `getAll()` function down the road.

## Example

In the `example` folder, you can find a Next.js feature test app. Here's a link deployed using SST's [`NextjsSite`](https://docs.sst.dev/constructs/NextjsSite) construct. It contains a handful of pages. Each page aims to test a single Next.js feature.

## Debugging

You can find the server log in the AWS CloudWatch console of the **region you deployed to**.

You can find the middleware log in the AWS CloudWatch console of the **region you are physically close to**. For example, if you deployed your app to `us-east-1` and you are in London, it's likely you will find the logs in `eu-west-2`.

## Opening an issue

Create a PR and add a new page to the benchmark app in `example` with the issue.

## Contribute

To run `OpenNext` locally:

1. Clone this repo
1. Build `open-next`
   ```bash
   cd open-next
   pnpm build
   ```
1. Run `open-next` in watch mode
   ```bash
   pnpm dev
   ```
1. Make `open-next` linkable from your Next.js app
   ```bash
   pnpm link --global
   ```
1. Link `open-next` in your Next.js app
   ```bash
   cd path/to/my/nextjs/app
   pnpm link --global open-next
   ```
   Now you can make changes in `open-next`, and run `pnpm open-next build` in your Next.js app to test the changes.

## FAQ

#### Why use the `@vercel/next` package for building the Next.js app?

The `next build` command generates a server function that runs the middleware. With this setup, if you use middleware for static pages, these pages cannot be cached. If cached, CDN (CloudFront) will send back the cached response without calling the origin (server Lambda function). To ensure the middleware is invoked on every request, caching is always disabled.

Vercel deploys the middleware code to edge functions, which gets invoked before the request reaches the CDN. This way, static pages can be cached. On request, the middleware gets called, and then the CDN can send back the cached response.

OpenNext is designed to adopt the same setup as Vercel. And building using `@vercel/next` allows us to separate the middleware code from the server code.

---

Maintained by [SST](https://sst.dev). Join our community: [Discord](https://sst.dev/discord) | [YouTube](https://www.youtube.com/c/sst-dev) | [Twitter](https://twitter.com/SST_dev)
