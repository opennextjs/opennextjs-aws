# open-next

## 3.0.2

### Patch Changes

- 61066fe: Fix polyfill for crypto in the middleware
- f83d636: Add support for 'deno' server functions
- 1b3c6fe: Fix static 404 and 500 in page router
- e98e014: Improve custom config support
- b3966d2: Fix duplicate cookies

## 3.0.1

### Patch Changes

- ff36f10: Fix next rewrites
- d5efc43: Fix next version check
- c2817fe: Handle partial failure in ISR revalidation
- 3b004dd: Fix for external middleware

## 3.0.0

### Major Changes

- b191ba3: OpenNext V3

  This is the V3 of OpenNext. It includes some breaking changes and cannot be used as a drop-in replacement for V2. If your IAC is using OpenNext V2, you will need to update it to use V3.

  If you are using OpenNext V2, please refer to the [migration guide](https://open-next.js.org/migration#from-opennext-v2) to upgrade to V3.

  ### New Features

  - Add support for function splitting
  - Add support for external middleware
  - Custom config file support : `open-next.config.ts`
  - Support for other deployment targets than lambda (Node.js, Docker and partial support for Cloudflare Workers)
  - Allow for customizing the outputs bundle :
    - Wrapper
    - Converter
    - Incremental Cache (Fetch cache and HTML/JSON/RSC cache)
    - Tag Cache
    - Queue (Used to trigger ISR revalidation)
    - Origin Resolver (Only for external middleware)
    - Image Loader (Only for image optimization)
    - Invoke function (For the warmer function)
  - Create an `open-next.output.json` file for easier integration with IAC tools

  ### Breaking Changes

  - Edge runtime don't work out of the box anymore. You need to deploy them on a separate function see [the config for more info](https://open-next.js.org/config)
  - Output directory structure has changed to support function splitting
  - Removed build arguments in favor of `open-next.config.ts`

  ### Internal Changes

  - Use OpenNextNodeResponse instead of ServerResponse (It uses transform stream to properly handle the stream)
  - Big refactor of the codebase to support function splitting
  - Added new plugins to support the new features and make the codebase more modular

## 2.3.9

### Patch Changes

- 5c80192: Fix incorrect 200 with wrong buildId for page router
- 2118ba2: Feat add a static etag for Image Optimization
- 6a3c69a: fix(edge): remove read-only and blacklisted headers from cloudfront response

## 2.3.8

### Patch Changes

- 8cfb801: fix(open-next): parse cookies when converting response to cloudfront

## 2.3.7

### Patch Changes

- 3235392: fix: prevent duplication of location header
- af2d3ce: Fix Image Optimization Support for Next@14.1.1

## 2.3.6

### Patch Changes

- f9b90b6: Security fix: sharp@0.33.2

## 2.3.5

### Patch Changes

- b9eefca: Fix Cache Support for Next@14.1.0
- c80f1be: Fix trailing slash redirect to external domain
- 186e28f: fix(open-next): correctly set cache control for html pages

## 2.3.4

### Patch Changes

- e773e67: try to match errors, fallback to raw key/value pair
- 83b0838: add support for bun lockfile
- bbf9b30: use dynamic import handler for monorepo entrypoint
- fd90b26: Changes encoding on cache.body for binary data

## 2.3.3

### Patch Changes

- abeb9cd: Setting the right tag values for fetch cache (#304); Fix getHeader crash external rewrites (#321); Added --package-json option to specify package json path (#322); Change querystring format for multi value parameters (#320);Fix tags cache (#317);Fix skip trailing slash redirect (#323)

## 2.3.2

### Patch Changes

- 4be2ac8: Reduce AWS S3 warning logs; add maxAttempts config to AWS SDK call

## 2.3.1

### Patch Changes

- 95bf402: Display sharp installation log on failure
- 1ed5ffd: Print plugin info in debug mode
- 1d83dab: Handle .map files during bundling cache assets

## 2.3.0

### Minor Changes

- 22e3e47: Fix inconsistencies with swr and isr (#289)

  Exclude manifest.json, robots.txt and sitemap.xml from routing matcher (#287)

  Feature/rewrite with query string (#281)

  Double chunk DDB batch writes to not overwhelm DDB on load (#293)

  fix: copy favicon.ico from app dir (#301)

  fix: XML Malformed Error DeleteObjectsCommand (#300)

  Fix external rewrite (#299)

  Perf Reduce s3 calls (#295)

## 2.2.4

### Patch Changes

- e3f67da: Fix 404 on index page; passthrough headers via middleware redirect; fix trailingSlash causing infinite loop

## 2.2.3

### Patch Changes

- 2d9e538: Make package path available at runtime
- 83ed943: Add OpenNext version header only in debug mode

## 2.2.2

### Patch Changes

- 68ae99a: Fix trailing slash; Fix cookies in next-config; Allow custom sharp version

## 2.2.1

### Patch Changes

- 4158d4f: Fix memory leak from too many files opened; add opt-out flags for app and pages cache revalidation

## 2.2.0

### Minor Changes

- 02bd7de: Streaming and cache revalidation

## 2.1.5

### Patch Changes

- 2ae2a1b: Fix windows image optimization build

## 2.1.4

### Patch Changes

- 29c54a4: Fix 2.1.3 cookie parsing with Expires prop

## 2.1.3

### Patch Changes

- 880973f: Set cookies properly in APIGateway response. Fixes #224

## 2.1.2

### Patch Changes

- 002b0f2: #219: fix window sharp command crash; #220: fix crash when cache-control is an array; #221: fix crash when cookies are missing from edge

## 2.1.1

### Patch Changes

- 10b0e55: Adds custom build-output-path and app-path arguments; fix custom swr header

## 2.1.0

### Minor Changes

- 67f3dcb: Support Nextjs 13.4.13+

## 2.0.5

### Patch Changes

- ffb2cfd: Server: fix missing react/jsx-runtime for require-hooks

## 2.0.4

### Patch Changes

- a468add: Fix missing HTML files for non blocking fallback pages

## 2.0.3

### Patch Changes

- 1bcb37b: server: add OpenNext response header to track version

## 2.0.2

### Patch Changes

- 22e8f70: ISR: support "notFound" and "redirect" in getStaticProps
- d6db51f: revalidation: fix ISR revalidation for rewritten URL
- b5a4c0c: Response: setHeader() and writeHead() return "this"

## 2.0.1

### Patch Changes

- bbd31b3: server: hash message dedup id

## 2.0.0

### Major Changes

- 855cf92: Improved ISR support

## 1.4.0

### Minor Changes

- 2df80cc: Support invoking OpenNext programmatically

### Patch Changes

- 194b389: Print Next.js version in build log
- ef30f3c: Allow custom build command
- 34b5298: Export dist folder

## 1.3.8

### Patch Changes

- e16aff7: npm publish root directory

## 1.3.7

### Patch Changes

- 2c2f6b9: server: fix react resolution for group routes

## 1.3.6

### Patch Changes

- 33460c3: server: Fix react dependencies resolution

## 1.3.5

### Patch Changes

- 19d9f95: server: use require() to resolve next/package.json

## 1.3.4

### Patch Changes

- 7a4b8d0: warmer: use debugger for logging
- 33dab58: server: do not override default alias for older Next.js versions

## 1.3.3

### Patch Changes

- c353984: server: handle duplicate API Gateway REST API query string

## 1.3.2

### Patch Changes

- b701d51: server: handle API Gateway REST API event without multiValueHeaders
- e330412: server: use node_modules React for Pages and prebundled for App

## 1.3.1

### Patch Changes

- 4bd2009: server: support ArrayBuffer response

## 1.3.0

### Minor Changes

- d03a8c5: Add ability to warm server function

## 1.2.1

### Patch Changes

- 54ce502: Set `__NEXT_PRIVATE_PREBUNDLED_REACT` to use prebundled React

## 1.2.0

### Minor Changes

- 935544a: Add support for NextRequest geolocation

### Patch Changes

- 0a4b952: Store public file posix path on Windows

## 1.1.0

### Minor Changes

- 7fb6116: Add option to minimize server bundle size

### Patch Changes

- 43d2370: Set "x-forwarded-host" as NextServer "host"
- fe6740b: Example: add NextAuth example

## 1.0.0

### Major Changes

- a7a279a: Document deployment options

### Patch Changes

- aaf4e71: Fix server function handler import path building on Windows

## 0.9.3

### Patch Changes

- a574834: Support API Gateway REST API event
- 81dbb69: Support Next.js apps without "public" folder

## 0.9.2

### Patch Changes

- ea0ab0c: Fix requesting public files returns 404
- 0f56b91: Add strict checking to detect public file request

## 0.9.1

### Patch Changes

- 0dadccb: Set default NODE_ENV to production

## 0.9.0

### Minor Changes

- 787c1b2: Support Next.js 404 pages

### Patch Changes

- 6395849: Fix "Cannot find package 'next'"

## 0.8.2

### Patch Changes

- e5b5204: Handle `next build` error

## 0.8.1

### Patch Changes

- bdd29d1: Fix spawn error on Windows

## 0.8.0

### Minor Changes

- 5a4455e: Add support for running server with Lambda@Edge

### Patch Changes

- 5a4455e: Server: handle undefined response status code
- 5a4455e: Turn on inline sourcemap when OPEN_NEXT_DEBUG is set
- 5a4455e: Remove minimal mode
