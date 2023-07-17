# open-next

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
