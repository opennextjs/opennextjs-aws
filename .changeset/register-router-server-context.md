---
"@opennextjs/aws": patch
---

Register the router server context under the project directory the route modules actually read.

Next.js delegates pages router `notFound` results to `routerServerContext.render404`, falling back to a bare `This page could not be found` body when that context is missing. `NextNodeServer` registers the context itself, but keys it on `path.relative(process.cwd(), server.dir)`, while the route modules read it back using the `relativeProjectDir` baked in at build time, which is always an empty string here. The two only line up because `server-adapter.ts` calls `process.chdir(__dirname)` on cold start, so the behaviour of a core rendering path depends on the working directory being changed by the adapter. Adapters that cannot change the working directory (Cloudflare Workers has no `process.chdir`) register the context under a key nothing reads and serve the fallback body instead of the app's 404 page.

A build-time AST patch bakes the build-time key (`""`) into `NextServer#handleCatchallRenderRequest` directly, so the write side no longer depends on `process.cwd()` matching the server directory. There is no behaviour change on AWS: the entry lands under the same key Next.js already used there, and Next.js still augments it per request.
