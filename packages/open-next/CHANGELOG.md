# open-next

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
