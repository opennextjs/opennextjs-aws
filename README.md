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
- [x] [NextAuth.js](https://next-auth.js.org)
- [x] [Running at edge](#running-at-edge)

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
       image-optimization-function/   -> Handler code for image optimization Lambda Function
   ```

3. Add `.open-next` to your `.gitignore` file
   ```
   # OpenNext
   /.open-next/
   ```

## How does OpenNext work?

When calling `open-next build`, OpenNext **runs `next build`** to build the Next.js app, and then **transforms the build output** to a format that can be deployed to AWS.

#### Building the Next.js app

OpenNext runs the `build` script in your `package.json` file. Depending on the lock file found in the app, the corresponding packager manager will be used. Either `npm run build`, `yarn build`, or `pnpm build` will be run.

#### Transforming the build output

The build output is then transformed into a format that can be deployed to AWS. Files in `assets/` are ready to be uploaded to AWS S3. And the function code is wrapped inside Lambda handlers, ready to be deployed to AWS Lambda or Lambda@Edge.

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

This function handles image optimization requests when the Next.js `<Image>` component is used. The [sharp](https://www.npmjs.com/package/sharp) library, which is bundled with the function, is used to convert the image. The library is compiled against the `arm64` architecture and is intended to run on AWS Lambda Arm/Graviton2 architecture. [Learn about the better cost-performance offered by AWS Graviton2 processors.](https://aws.amazon.com/blogs/aws/aws-lambda-functions-powered-by-aws-graviton2-processor-run-your-functions-on-arm-and-get-up-to-34-better-price-performance/)

Note that the image optimization function responds with the `Cache-Control` header, so the image will be cached both at the CDN level and at the browser level.

#### Server Lambda function

Create a Lambda function using the code in the `.open-next/server-function` folder, with the handler `index.mjs`.

This function handles all other types of requests from the Next.js app, including Server-side Rendering (SSR) requests and API requests. OpenNext builds the Next.js app in **standalone** mode. The standalone mode generates a `.next` folder containing the **NextServer** class that handles requests and a `node_modules` folder with **all the dependencies** needed to run the `NextServer`. The structure looks like this:

```
  .next/                -> NextServer
  node_modules/         -> dependencies
```

The server function adapter wraps around `NextServer` and exports a handler function that supports the Lambda request and response. The `server-function` bundle looks like this:

```diff
  .next/                -> NextServer
+ .open-next/
+   public-files.json   -> `/public` file listing
  node_modules/         -> dependencies
+ index.mjs             -> server function adapter
```

The file `public-files.json` contains the top-level file and directory names in your app's `public/` folder. At runtime, the server function will forward any requests made to these files and directories to S3. And S3 will serve them directly. [See why.](#workaround-public-static-files-served-out-by-server-function-aws-specific)

**Monorepo**

In the case of a monorepo, the build output looks slightly different. For example, if the app is located in `packages/web`, the build output looks like this:

```
  packages/
    web/
      .next/            -> NextServer
      node_modules/     -> dependencies from root node_modules (optional)
  node_modules/         -> dependencies from package node_modules
```

In this case, the server function adapter needs to be created inside `packages/web` next to `.next/`. This is to ensure that the adapter can import dependencies from both `node_modules` folders. It is not a good practice to have the Lambda configuration coupled with the project structure, so instead of setting the Lambda handler to `packages/web/index.mjs`, we will add a wrapper `index.mjs` at the `server-function` bundle root that re-exports the adapter. The resulting structure looks like this:

```diff
  packages/
    web/
      .next/                -> NextServer
+     .open-next/
+       public-files.json   -> `/public` file listing
      node_modules/          -> dependencies from root node_modules (optional)
+     index.mjs              -> server function adapter
  node_modules/              -> dependencies from package node_modules
+ index.mjs                  -> adapter wrapper
```

This ensures that the Lambda handler remains at `index.mjs`.

#### CloudFront distribution

Create a CloudFront distribution, and dispatch requests to their corresponding handlers (behaviors). The following behaviors are configured:

| Behavior          | Requests            | Origin                                                                                                                                       |
| ----------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `/_next/static/*` | Hashed static files | S3 bucket                                                                                                                                    |
| `/_next/image`    | Image optimization  | image optimization function                                                                                                                  |
| `/_next/data/*`   | data requests       | server function                                                                                                                              |
| `/api/*`          | API                 | server function                                                                                                                              |
| `/*`              | catch all           | server function fallback to<br />S3 bucket on 503<br />[see why](#workaround-public-static-files-served-out-by-server-function-aws-specific) |

#### Running at edge

The server function can also run at edge locations by configuring it as Lambda@Edge on Origin Request. The server function can accept both regional request events (API payload version 2.0) and edge request events (CloudFront Origin Request payload). Depending on the shape of the Lambda event object, the function will process the request accordingly.

To configure the CloudFront distribution:

| Behavior          | Requests            | Lambda@Edge     | Origin                                                                                               |
| ----------------- | ------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `/_next/static/*` | Hashed static files | -               | S3 bucket                                                                                            |
| `/_next/image`    | Image optimization  | -               | image optimization function                                                                          |
| `/_next/data/*`   | data requests       | server function | -                                                                                                    |
| `/api/*`          | API                 | server function | -                                                                                                    |
| `/*`              | catch all           | server function | S3 bucket<br />[see why](#workaround-public-static-files-served-out-by-server-function-aws-specific) |

## Limitations and workarounds

#### WORKAROUND: `public/` static files served by the server function (AWS specific)

As mentioned in the [S3 bucket](#s3-bucket) section, files in your app's `public/` folder are static and are uploaded to the S3 bucket. Ideally, requests for these files should be handled by the S3 bucket, like so:

```
https://my-nextjs-app.com/favicon.ico
```

This requires the CloudFront distribution to have the behavior `/favicon.ico` and set the S3 bucket as the origin. However, CloudFront has a [default limit of 25 behaviors per distribution](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-web-distributions), so it is not a scalable solution to create one behavior per file.

To work around the issue, requests for `public/` files are handled by the catch all behavior `/*`. This behavior sends the request to the server function first, and if the server fails to handle the request, it will fall back to the S3 bucket.

During the build process, the top-level file and directory names in the `public/` folder are saved to the `.open-next/public-files.json` file within the server function bundle. At runtime, the server function checks the request URL path against the file. If the request is made to a file in the `public/` folder:

- When deployed to a single region (Lambda), the server function returns a 503 response right away, and S3, which is configured as the failover origin on 503 status code, will serve the file. [Refer to the CloudFront setup.](#cloudfront-distribution)
- When deployed to the edge (Lambda@Edge), the server function returns the request object. And the request will be handled by S3, which is configured as the origin. [Refer to the CloudFront setup.](#running-at-edge)

This means that on cache miss, the request may take slightly longer to process.

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

## Example

In the `example` folder, you can find a Next.js feature test app. It contains a variety of pages that each test a single Next.js feature.

Here's a link deployed using SST's [`NextjsSite`](https://docs.sst.dev/constructs/NextjsSite) construct.

## Debugging

To find the **server and image optimization log**, go to the AWS CloudWatch console in the **region you deployed to**.

If the server function is **deployed to Lambda@Edge**, the logs will appear in the **region you are physically close to**. For example, if you deployed your app to `us-east-1` and you are visiting the app from in London, the logs are likely to be in `eu-west-2`.

#### Debug mode

You can run OpenNext in debug mode by setting the `OPEN_NEXT_DEBUG` environment variable:

```bash
OPEN_NEXT_DEBUG=true npx open-next@latest build
```

This does a few things:

1. Lambda handler functions in the build output will not be minified.
1. Lambda handler functions in the build output has sourcemap enabled inline.
1. Lambda handler functions will automatically `console.log` the request event object along with other debugging information.

It is recommended to **turn off debug mode when building for production** because:

1. Un-minified function code is 2-3X larger than minified code. This will result in longer Lambda cold start times.
1. Logging the event object on each request can result in a lot of logs being written to AWS CloudWatch. This will result in increased AWS costs.

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
1. Now, you can make changes in `open-next` and build your Next.js app to test the changes.
   ```bash
   cd path/to/my/nextjs/app
   path/to/open-next/packages/open-next/dist/index.js build
   ```

## FAQ

#### Will my Next.js app behave the same as it does on Vercel?

OpenNext aims to deploy your Next.js app to AWS using services like CloudFront, S3, and Lambda. While Vercel uses some AWS services, it also has proprietary infrastructures, resulting in a natural gap of feature parity. And OpenNext is filling that gap.

One architectural difference is how [middleware](https://nextjs.org/docs/advanced-features/middleware) is run, but this should not affect the behavior of most apps.

On Vercel, the Next.js app is built in an undocumented way using the "[minimalMode](https://github.com/vercel/next.js/discussions/29801)". The middleware code is separated from the server code and deployed to edge locations, while the server code is deployed to a single region. When a user makes a request, the middleware code runs first. Then the request reaches the CDN. If the request is cached, the cached response is returned; otherwise, the request hits the server function. This means that the middleware is called even for cached requests.

On the other hand, OpenNext uses the standard `next build` command, which generates a server function that includes the middleware code. This means that for cached requests, the CDN (CloudFront) will send back the cached response, and the middleware code is not run.

We previously built the app using the "minimalMode" and having the same architecture as Vercel, where the middleware code would run in Lambda@Edge on Viewer Request. See the [`vercel-mode` branch](https://github.com/serverless-stack/open-next/tree/vercel-mode). However, we decided that this architecture was not a good fit on AWS for a few reasons:

1. Cold start - Running middleware and server in two separate Lambda functions results in double the latency.
1. Maintenance - Because the "minimalMode" is not documented, there will likely be unhandled edge cases, and triaging would require constant reverse engineering of Vercel's code base.
1. Feature parity - Lambda@Edge functions triggered on Viewer Request do not have access to geolocation headers, which affects i18n support.

#### How does OpenNext compared to AWS Amplify?

OpenNext is an open source initiative, and there are a couple of advantages when compared to Amplify:

1. The community contributions to OpenNext allows it to have better feature support.

1. Amplify's Next.js hosting is a black box. Resources are not deployed to your AWS account. All Amplify users share the same CloudFront CDN owned by the Amplify team. This prevents you from customizing the setup, and customization is important if you are looking for Vercel-like features.

1. Amplify's implementation is closed-source. Bug fixes often take much longer to get fixed as you have to go through AWS support. And you are likely to encounter more quirks when hosting Next.js anywhere but Vercel.

---

Maintained by [SST](https://sst.dev). Join our community: [Discord](https://sst.dev/discord) | [YouTube](https://www.youtube.com/c/sst-dev) | [Twitter](https://twitter.com/SST_dev)
