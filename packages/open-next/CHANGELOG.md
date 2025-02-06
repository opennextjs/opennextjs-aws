# open-next

## 3.4.2

### Patch Changes

- [#722](https://github.com/opennextjs/opennextjs-aws/pull/722) [`dd9face0d31d994890b5668b1f117775adccf274`](https://github.com/opennextjs/opennextjs-aws/commit/dd9face0d31d994890b5668b1f117775adccf274) Thanks [@vicb](https://github.com/vicb)! - fix(cloudflare): enable trailiing slash redirect

- [#718](https://github.com/opennextjs/opennextjs-aws/pull/718) [`14b81827f9078b98e32115fb5cfe706d03d64537`](https://github.com/opennextjs/opennextjs-aws/commit/14b81827f9078b98e32115fb5cfe706d03d64537) Thanks [@vicb](https://github.com/vicb)! - fix(cloudflare): PPR in wrangler dev

  PPR works fine when deployed but not in dev because of bug in miniflare.
  Adding a workaround until the bug is fixed upstream.

- [#724](https://github.com/opennextjs/opennextjs-aws/pull/724) [`94d6eca5e8baa6f93734a2ba1dbfbf0083252c75`](https://github.com/opennextjs/opennextjs-aws/commit/94d6eca5e8baa6f93734a2ba1dbfbf0083252c75) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: remove `cf-connecting-ip` headers from external override requests

  this change removes `cf-connecting-ip` headers from requests being sent to
  external urls during rewrites, this allows such overrides, when run inside a
  Cloudflare worker to rewrite to urls also hosted on Cloudflare

- [#715](https://github.com/opennextjs/opennextjs-aws/pull/715) [`843497bac327206aeac4db585ac1663fc6c14ced`](https://github.com/opennextjs/opennextjs-aws/commit/843497bac327206aeac4db585ac1663fc6c14ced) Thanks [@vicb](https://github.com/vicb)! - Dump ESBuild build metadata to `<bundle>.meta.json` in debug mode

## 3.4.1

### Patch Changes

- [#708](https://github.com/opennextjs/opennextjs-aws/pull/708) [`7eda030388880d8ad25d3f4692e24bac31b7ec4f`](https://github.com/opennextjs/opennextjs-aws/commit/7eda030388880d8ad25d3f4692e24bac31b7ec4f) Thanks [@sommeeeer](https://github.com/sommeeeer)! - fix: add early return for downplayed aws-sdk errors

  In the logger adapter:

  An issue was identified where downplayed errors from the aws-sdk client (f.ex NoSuchKey from S3) would not return from the function early. This caused unnecessary invocation of `console.error` outside the conditional.

- [#704](https://github.com/opennextjs/opennextjs-aws/pull/704) [`e5678b39e0f3c21d3e30d08a89f5cb0acdd3d050`](https://github.com/opennextjs/opennextjs-aws/commit/e5678b39e0f3c21d3e30d08a89f5cb0acdd3d050) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure edge function entries are properly awaited

- [#702](https://github.com/opennextjs/opennextjs-aws/pull/702) [`1981a47dd3dbc77066d2bf5cad5d5d406fecb010`](https://github.com/opennextjs/opennextjs-aws/commit/1981a47dd3dbc77066d2bf5cad5d5d406fecb010) Thanks [@vicb](https://github.com/vicb)! - refactor(cache): deprecate global disableDynamoDBCache and disableIncrementalCache

  In the cache adapter:

  - `globalThis.disableDynamoDBCache` is deprecated and will be removed.
    use `globalThis.openNextConfig.dangerous?.disableTagCache` instead.
  - `globalThis.disableIncrementalCache` is deprecated and will be removed.
    use `globalThis.openNextConfig.dangerous?.disableIncrementalCache` instead.

- [#709](https://github.com/opennextjs/opennextjs-aws/pull/709) [`b4ad0f0e0f6069ca87f3b72c23d655cedebc86e5`](https://github.com/opennextjs/opennextjs-aws/commit/b4ad0f0e0f6069ca87f3b72c23d655cedebc86e5) Thanks [@conico974](https://github.com/conico974)! - fix: stableIncrementalCache is only used for Next.js >= 14.1

## 3.4.0

### Minor Changes

- [#689](https://github.com/opennextjs/opennextjs-aws/pull/689) [`e8f6dc8c7a421e316f5fbed03dcb82bb860c5249`](https://github.com/opennextjs/opennextjs-aws/commit/e8f6dc8c7a421e316f5fbed03dcb82bb860c5249) Thanks [@conico974](https://github.com/conico974)! - Added some override for debugging OpenNext locally

- [#699](https://github.com/opennextjs/opennextjs-aws/pull/699) [`eaa9ef8daf2fc454139c77ce0e100cb48da15561`](https://github.com/opennextjs/opennextjs-aws/commit/eaa9ef8daf2fc454139c77ce0e100cb48da15561) Thanks [@conico974](https://github.com/conico974)! - Add a new multi-tiered incremental cache

- [#665](https://github.com/opennextjs/opennextjs-aws/pull/665) [`ae7fb9c5d24ecf3eeb99682aa34bcbe0adb45675`](https://github.com/opennextjs/opennextjs-aws/commit/ae7fb9c5d24ecf3eeb99682aa34bcbe0adb45675) Thanks [@conico974](https://github.com/conico974)! - Add an override to automatically invalidate the CDN (not enabled by default)

### Patch Changes

- [#701](https://github.com/opennextjs/opennextjs-aws/pull/701) [`00ce837cb98e5902316f26163c9fb927058f956c`](https://github.com/opennextjs/opennextjs-aws/commit/00ce837cb98e5902316f26163c9fb927058f956c) Thanks [@james-elicx](https://github.com/james-elicx)! - refactor: use utility for cross-platform path regex construction

- [#698](https://github.com/opennextjs/opennextjs-aws/pull/698) [`d1cea5601943afaa197d56f931593234f351c441`](https://github.com/opennextjs/opennextjs-aws/commit/d1cea5601943afaa197d56f931593234f351c441) Thanks [@conico974](https://github.com/conico974)! - Fix external rewrites for binary data

- [#694](https://github.com/opennextjs/opennextjs-aws/pull/694) [`6884444cb929ab60c074c918954d24100f4e9668`](https://github.com/opennextjs/opennextjs-aws/commit/6884444cb929ab60c074c918954d24100f4e9668) Thanks [@james-elicx](https://github.com/james-elicx)! - Mark the host header as trusted when the OpenNext project has external middleware to align with normal behavior for the Next.js server.

- [#688](https://github.com/opennextjs/opennextjs-aws/pull/688) [`86916bfd9246a63f321352bb11346eeb0ca3f6da`](https://github.com/opennextjs/opennextjs-aws/commit/86916bfd9246a63f321352bb11346eeb0ca3f6da) Thanks [@vicb](https://github.com/vicb)! - fix city name header encoding

  - encode the header in cloudflare wrapper
  - decode the header in the routing layer

- [#695](https://github.com/opennextjs/opennextjs-aws/pull/695) [`e708ec4d9f4c87d3249a01382482347d295ed28a`](https://github.com/opennextjs/opennextjs-aws/commit/e708ec4d9f4c87d3249a01382482347d295ed28a) Thanks [@james-elicx](https://github.com/james-elicx)! - Fix esbuild edge plugins not matching Windows paths.

## 3.3.1

### Patch Changes

- [#684](https://github.com/opennextjs/opennextjs-aws/pull/684) [`9595714ac23e5f131b879d04d5cfb2a5d11bdbdd`](https://github.com/opennextjs/opennextjs-aws/commit/9595714ac23e5f131b879d04d5cfb2a5d11bdbdd) Thanks [@vicb](https://github.com/vicb)! - fix: fetch cache does not depend on tag cache being enabled

- [#685](https://github.com/opennextjs/opennextjs-aws/pull/685) [`4e88b47935523de1d15da067b56105bd6be91e47`](https://github.com/opennextjs/opennextjs-aws/commit/4e88b47935523de1d15da067b56105bd6be91e47) Thanks [@conico974](https://github.com/conico974)! - fix html cache headers with i18n

- [#673](https://github.com/opennextjs/opennextjs-aws/pull/673) [`7140ca56e1e88d7a7cae327eceb3ef8c2fde2a1e`](https://github.com/opennextjs/opennextjs-aws/commit/7140ca56e1e88d7a7cae327eceb3ef8c2fde2a1e) Thanks [@conico974](https://github.com/conico974)! - Add additional metadata to RoutingResult

  For some future features [#658](https://github.com/opennextjs/opennextjs-aws/issues/658) (and bug fix [#677](https://github.com/opennextjs/opennextjs-aws/issues/677)) we need to add some additional metadata to the RoutingResult.
  This PR adds 2 new fields to the RoutingResult: `initialPath` and `resolvedRoutes`

## 3.3.0

### Minor Changes

- [#663](https://github.com/opennextjs/opennextjs-aws/pull/663) [`4d328e3fc306b878e9497986baa65bfd1d4de66a`](https://github.com/opennextjs/opennextjs-aws/commit/4d328e3fc306b878e9497986baa65bfd1d4de66a) Thanks [@vicb](https://github.com/vicb)! - refactor: move StreamCreator to types/open-next

- [#649](https://github.com/opennextjs/opennextjs-aws/pull/649) [`2b2a48b70ae95b5e600ac2e4b7f2df8702c5c26e`](https://github.com/opennextjs/opennextjs-aws/commit/2b2a48b70ae95b5e600ac2e4b7f2df8702c5c26e) Thanks [@vicb](https://github.com/vicb)! - feat: Add support for OPEN_NEXT_ERROR_LOG_LEVEL

  OPEN_NEXT_ERROR_LOG_LEVEL is the minimal error level from which internal errors are logged.
  It can be set to:

  - "0" / "debug"
  - "1" / "warn" (default)
  - "2" / "error"

- [#642](https://github.com/opennextjs/opennextjs-aws/pull/642) [`0ac604e5867497cc93fb677b5ebc28ef87e057f8`](https://github.com/opennextjs/opennextjs-aws/commit/0ac604e5867497cc93fb677b5ebc28ef87e057f8) Thanks [@vicb](https://github.com/vicb)! - feat: add a cloudflare-streaming wrapper

### Patch Changes

- [#644](https://github.com/opennextjs/opennextjs-aws/pull/644) [`f685ddea8f8a5c82591dc02713aff7138f2d9896`](https://github.com/opennextjs/opennextjs-aws/commit/f685ddea8f8a5c82591dc02713aff7138f2d9896) Thanks [@vicb](https://github.com/vicb)! - fix(cloudflare): cloudflare-streaming do not use the edge runtime

- [#650](https://github.com/opennextjs/opennextjs-aws/pull/650) [`ef1fe48d570863266c271e5dedaf02b943849ded`](https://github.com/opennextjs/opennextjs-aws/commit/ef1fe48d570863266c271e5dedaf02b943849ded) Thanks [@vicb](https://github.com/vicb)! - fix: dummy override errors

- [#664](https://github.com/opennextjs/opennextjs-aws/pull/664) [`8ab921f8b5bd40c7ba109ccef3e59a6c24283fb2`](https://github.com/opennextjs/opennextjs-aws/commit/8ab921f8b5bd40c7ba109ccef3e59a6c24283fb2) Thanks [@vicb](https://github.com/vicb)! - fix(cloudflare): fix the node wrapper

- [#645](https://github.com/opennextjs/opennextjs-aws/pull/645) [`2202f36ce0f87357b249bd127cdd5e84d6deffd3`](https://github.com/opennextjs/opennextjs-aws/commit/2202f36ce0f87357b249bd127cdd5e84d6deffd3) Thanks [@vicb](https://github.com/vicb)! - refactor(cloudflare): rename the "cloudflare" wrapper to "cloudflare-edge"

- [#671](https://github.com/opennextjs/opennextjs-aws/pull/671) [`44392ba82990d43e16a614113d9e7d8e257e5bdd`](https://github.com/opennextjs/opennextjs-aws/commit/44392ba82990d43e16a614113d9e7d8e257e5bdd) Thanks [@davidjoy](https://github.com/davidjoy)! - fix: add audio/flac to commonBinaryMimeTypes

- [#660](https://github.com/opennextjs/opennextjs-aws/pull/660) [`4dea7ea2f5ffd1848e51502c88d2efcc1896bb8c`](https://github.com/opennextjs/opennextjs-aws/commit/4dea7ea2f5ffd1848e51502c88d2efcc1896bb8c) Thanks [@vicb](https://github.com/vicb)! - fix: partially reverts 644

- [#672](https://github.com/opennextjs/opennextjs-aws/pull/672) [`1ece6b479bb4e0309892ffbd1200870821a410c4`](https://github.com/opennextjs/opennextjs-aws/commit/1ece6b479bb4e0309892ffbd1200870821a410c4) Thanks [@alebelcor](https://github.com/alebelcor)! - fix(aws): add missing base path to data routes

- [#675](https://github.com/opennextjs/opennextjs-aws/pull/675) [`697681bf9ce25212ce4e2e94d886ca425428280d`](https://github.com/opennextjs/opennextjs-aws/commit/697681bf9ce25212ce4e2e94d886ca425428280d) Thanks [@sommeeeer](https://github.com/sommeeeer)! - Import correct loggers in proxyExternalRequest override

## 3.2.2

### Patch Changes

- [#617](https://github.com/opennextjs/opennextjs-aws/pull/617) [`6f798debb575b157acb2f5068658f95ace0fae50`](https://github.com/opennextjs/opennextjs-aws/commit/6f798debb575b157acb2f5068658f95ace0fae50) Thanks [@vicb](https://github.com/vicb)! - feat: add support for Next15 geolocation

- [#638](https://github.com/opennextjs/opennextjs-aws/pull/638) [`fe600ac6f5e513376cf233a5d2ce68affaa3aa5a`](https://github.com/opennextjs/opennextjs-aws/commit/fe600ac6f5e513376cf233a5d2ce68affaa3aa5a) Thanks [@vicb](https://github.com/vicb)! - fix(http): Set content-length only if body is present

  The body is undefined when using the edge converter and the method is GET or HEAD

- [#626](https://github.com/opennextjs/opennextjs-aws/pull/626) [`5f0cbc8feac9eec728c27bb3b7ff5c3f3bc26716`](https://github.com/opennextjs/opennextjs-aws/commit/5f0cbc8feac9eec728c27bb3b7ff5c3f3bc26716) Thanks [@conico974](https://github.com/conico974)! - add support for next/after
  It can also be used to emulate vercel request context (the waitUntil) for lib that may rely on it on serverless env. It needs this env variable EMULATE_VERCEL_REQUEST_CONTEXT to be set to be enabled

- [#632](https://github.com/opennextjs/opennextjs-aws/pull/632) [`8b51108d9aee7e5ed3027c1ceda99091b579951d`](https://github.com/opennextjs/opennextjs-aws/commit/8b51108d9aee7e5ed3027c1ceda99091b579951d) Thanks [@conico974](https://github.com/conico974)! - fix 304 incorrectly set as 200

- [#630](https://github.com/opennextjs/opennextjs-aws/pull/630) [`b999c4e9a38499680bed77ddeb94b62a3301c0fa`](https://github.com/opennextjs/opennextjs-aws/commit/b999c4e9a38499680bed77ddeb94b62a3301c0fa) Thanks [@conico974](https://github.com/conico974)! - Feat: Allow overriding the proxying for external rewrite

- [#633](https://github.com/opennextjs/opennextjs-aws/pull/633) [`ba84259d2e35e79a562a7e3f055e350a03c9d651`](https://github.com/opennextjs/opennextjs-aws/commit/ba84259d2e35e79a562a7e3f055e350a03c9d651) Thanks [@chanceaclark](https://github.com/chanceaclark)! - When copying over assets, check to see if favicon.ico is a file. In some cases favicon.ico is a folder that can contain a route handler.

## 3.2.1

### Patch Changes

- [#604](https://github.com/opennextjs/opennextjs-aws/pull/604) [`cf33973f3fbab73e77898fdd072a00a1f037257a`](https://github.com/opennextjs/opennextjs-aws/commit/cf33973f3fbab73e77898fdd072a00a1f037257a) Thanks [@vicb](https://github.com/vicb)! - fix(middleware): always compiles the middleware.

  Prior to this PR the middleware would only be compiled when a middleware.ts exists.

- [#603](https://github.com/opennextjs/opennextjs-aws/pull/603) [`77d87e7a870fad6afad022bf75aca18c8656c268`](https://github.com/opennextjs/opennextjs-aws/commit/77d87e7a870fad6afad022bf75aca18c8656c268) Thanks [@john-trieu-nguyen](https://github.com/john-trieu-nguyen)! - Fix redirect when containing "+" and decode values for URLSearchParams

- [#612](https://github.com/opennextjs/opennextjs-aws/pull/612) [`a43b82b4cb68889371ac8260aefef9e04eefb037`](https://github.com/opennextjs/opennextjs-aws/commit/a43b82b4cb68889371ac8260aefef9e04eefb037) Thanks [@vicb](https://github.com/vicb)! - feature(edge): add a way for convertTo to return a Request

- [#598](https://github.com/opennextjs/opennextjs-aws/pull/598) [`bfa1a8c4056bd691fb57617dd6287693e51071b4`](https://github.com/opennextjs/opennextjs-aws/commit/bfa1a8c4056bd691fb57617dd6287693e51071b4) Thanks [@conico974](https://github.com/conico974)! - Fix external redirect trailing

- [#601](https://github.com/opennextjs/opennextjs-aws/pull/601) [`5839217411012d1df2874d299daa977ba3701c2c`](https://github.com/opennextjs/opennextjs-aws/commit/5839217411012d1df2874d299daa977ba3701c2c) Thanks [@conico974](https://github.com/conico974)! - fix fetch cache for next 15

- [#613](https://github.com/opennextjs/opennextjs-aws/pull/613) [`dfc174d88b7bcc54eede09c98d9443dd84b93fd8`](https://github.com/opennextjs/opennextjs-aws/commit/dfc174d88b7bcc54eede09c98d9443dd84b93fd8) Thanks [@vicb](https://github.com/vicb)! - feat(middleware): add ability to force single build pass

## 3.2.0

### Minor Changes

- [#574](https://github.com/opennextjs/opennextjs-aws/pull/574) [`216e05c545d0bba680306ad1bad6057345232b88`](https://github.com/opennextjs/opennextjs-aws/commit/216e05c545d0bba680306ad1bad6057345232b88) Thanks [@conico974](https://github.com/conico974)! - Add a new option to install native dependencies on every lambda

- [#579](https://github.com/opennextjs/opennextjs-aws/pull/579) [`5f661b53675f3dc9bef8c05072be949c476328f3`](https://github.com/opennextjs/opennextjs-aws/commit/5f661b53675f3dc9bef8c05072be949c476328f3) Thanks [@conico974](https://github.com/conico974)! - Refactor overrides

### Patch Changes

- [#585](https://github.com/opennextjs/opennextjs-aws/pull/585) [`8f4b67a9f4c18ddfe31e1d90caf35bdb2d780163`](https://github.com/opennextjs/opennextjs-aws/commit/8f4b67a9f4c18ddfe31e1d90caf35bdb2d780163) Thanks [@alacroix](https://github.com/alacroix)! - Support i18n localeDetection with value false

- [#567](https://github.com/opennextjs/opennextjs-aws/pull/567) [`d6d4b8f83da47b7ec3b0e7b565c38567a3ff0742`](https://github.com/opennextjs/opennextjs-aws/commit/d6d4b8f83da47b7ec3b0e7b565c38567a3ff0742) Thanks [@sommeeeer](https://github.com/sommeeeer)! - Hides the x-opennext header from server requests when poweredByHeader is false in next config

- [#575](https://github.com/opennextjs/opennextjs-aws/pull/575) [`c8cf0fc50a6ef9ee406f2bd400666feef0a9179f`](https://github.com/opennextjs/opennextjs-aws/commit/c8cf0fc50a6ef9ee406f2bd400666feef0a9179f) Thanks [@zdenham](https://github.com/zdenham)! - Add protobuf to common binary formats

## 3.1.6

### Patch Changes

- [`ad513ef`](https://github.com/opennextjs/opennextjs-aws/commit/ad513efb8856ebdfbc11482537986abb0524ab75) Thanks [@thdxr](https://github.com/thdxr)! - remove extra binary in bin specification

## 3.1.5

### Patch Changes

- [#542](https://github.com/opennextjs/opennextjs-aws/pull/542) [`178ab2b`](https://github.com/opennextjs/opennextjs-aws/commit/178ab2b1c95701a5f20aec107acf1fe1c6e3d9be) Thanks [@conico974](https://github.com/conico974)! - Basic support for PPR

- [#555](https://github.com/opennextjs/opennextjs-aws/pull/555) [`a5fd42f`](https://github.com/opennextjs/opennextjs-aws/commit/a5fd42fa76a329cf79bba8a6af20f87481074e47) Thanks [@JackParn33](https://github.com/JackParn33)! - Fixes proxy handling of encoded request/responses, previously responses could be cut off.

## 3.1.4

### Patch Changes

- b5bfb5d: Fix response binary content handling
- 6b894df: lazily initialize lite client
- 8b576d9: fix content-length incorrectly set in proxyRequest
- 9fceedb: fix: fix basePath support for API routes
- 5cdbc9f: Update vulnerable path-to-regexp dependency
- 50703a3: Fix cloudflare env
  Fix an issue with cookies and the node wrapper
  Fix some issue with cookies being not properly set when set both in the routing layer and the route itself
  Added option for headers priority

## 3.1.3

### Patch Changes

- 4ec9265: fix middleware and headers matcher not working properly with i18n
- 4894974: Improve config validation
- 55a6bcc: fix incremental cache for next 15

## 3.1.2

### Patch Changes

- 1b87222: patch asyncStorage for ISR and fetch
- a7540fd: fix wrong locale in middleware
- b8bd2f0: fix \_\_import_unsupported being undefined

## 3.1.1

### Patch Changes

- 85af1ce: Fix node crashing when used without stream
- 2094c9b: fix issue with fetch cache for new page

## 3.1.0

### Minor Changes

- b88ae13: Replace InternalResult body from string to ReadableStream
- 0558bf6: Add an optional external cache

### Patch Changes

- c8d692b: fix missing polyfill URLPattern
- 1b91708: fix 404 when basePath is set
- 8ddb621: fix lambda streaming hanging after return

## 3.0.8

### Patch Changes

- 75857cf: fix middleware for next 15
- 1dd2b16: fix: Nx monorepo support
- 220be99: fix rewrite/redirect with i18n
- b93034d: Fix issues with revalidateTag/revalidatePath
- 59ff2ee: support next.config.ts

## 3.0.7

### Patch Changes

- 1a1441c: Add missing method from NextResponse for next 12
- b8ffa3a: add check for config and config.default
- ab0f8b2: [windows] Add Windows compatibility for the `resolve` ESBuild plugin
- 7beaf82: [windows] Add Windows compatibility for the `replacement` ESBuild plugin
- e2d0c7f: [windows] Specify the `file://` protocol when importing config on Windows

## 3.0.6

### Patch Changes

- 208f7ba: Fix incorrect redirects to different domains
- 7931bee: fix 404 handeling with i18n routes
- 579f9eb: Better support for cloudflare external middleware

## 3.0.5

### Patch Changes

- 8f1d2b4: Fix: dangling promises

## 3.0.4

### Patch Changes

- 5fc48d0: Fix some cache issue

## 3.0.3

### Patch Changes

- 71b3347: fix: look for required-server-files.json in outputPath
- 1524dd3: Perf: Add some new cache and queue options
- bc26e9a: Fix for readonly headers lambda@edge
- 6032493: Fix for lambda streaming on empty body
- 22e80d7: Fix env file not being copied in V3
- a46d3fc: fix 404 when no route match at all

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

  - Edge runtime don't work out of the box anymore. You need to deploy them on a separate function see [the config for more info](https://opennext.js.org/config)
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
