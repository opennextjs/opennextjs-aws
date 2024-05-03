---
"open-next": major
---

OpenNext V3

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
