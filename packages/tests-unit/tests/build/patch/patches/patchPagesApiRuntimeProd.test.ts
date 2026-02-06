import {
  headFetchProtocolRule,
  trustHostHeaderRule,
} from "@opennextjs/aws/build/patch/patches/patchPagesApiRuntimeProd";
import { describe, expect, it } from "vitest";
import { computePatchDiff } from "./util.js";

const pagesResRevalidateCodeBundled = `
class NextNodeServer extends _baseserver.default {
async function tO(e,t,r,n){if("string"!=typeof e||!e.startsWith("/"))throw Object.defineProperty(Error(\`Invalid urlPath provided to revalidate(), must be a path e.g. /blog/post-1, received \${e}\`),"__NEXT_ERROR_CODE",{value:"E153",enumerable:!1,configurable:!0});let i={[x.y3]:n.previewModeId,...t.unstable_onlyGenerated?{[x.Qq]:"1"}:{}},a=[...n.allowedRevalidateHeaderKeys||[]];for(let e of((n.trustHostHeader||n.dev)&&a.push("cookie"),n.trustHostHeader&&a.push("x-vercel-protection-bypass"),Object.keys(r.headers)))a.includes(e)&&(i[e]=r.headers[e]);let s=n.internalRevalidate;try{if(s)return await s({urlPath:e,revalidateHeaders:i,opts:t});if(r.trustHostHeader){let n=await fetch(\`https://\${r.headers.host}\${e}\`,{method:"HEAD",headers:i}),a=n.headers.get("x-vercel-cache")||n.headers.get("x-nextjs-cache");if((null==a?void 0:a.toUpperCase())!=="REVALIDATED"&&200!==n.status&&!(404===n.status&&t.unstable_onlyGenerated))throw Object.defineProperty(Error(\`Invalid response \${n.status}\`),"__NEXT_ERROR_CODE",{value:"E175",enumerable:!1,configurable:!0})}else throw Object.defineProperty(Error("Invariant: missing internal router-server-methods this is an internal bug"),"__NEXT_ERROR_CODE",{value:"E676",enumerable:!1,configurable:!0})}catch(t){throw Object.defineProperty(Error(\`Failed to revalidate \${e}: \${t_(t)?t.message:t}\`),"__NEXT_ERROR_CODE",{value:"E240",enumerable:!1,configurable:!0})}}
`;

const pagesResRevalidateCodeUnbundled = `
async function revalidate(urlPath, opts, req, context) {
    if (typeof urlPath !== 'string' || !urlPath.startsWith('/')) {
        throw Object.defineProperty(new Error(\`Invalid urlPath provided to revalidate(), must be a path e.g. /blog/post-1, received \${urlPath}\`), "__NEXT_ERROR_CODE", {
            value: "E153",
            enumerable: false,
            configurable: true
        });
    }
    const revalidateHeaders = {
        [PRERENDER_REVALIDATE_HEADER]: context.previewModeId,
        ...opts.unstable_onlyGenerated ? {
            [PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER]: '1'
        } : {}
    };
    const allowedRevalidateHeaderKeys = [
        ...context.allowedRevalidateHeaderKeys || []
    ];
    if (context.trustHostHeader || context.dev) {
        allowedRevalidateHeaderKeys.push('cookie');
    }
    if (context.trustHostHeader) {
        allowedRevalidateHeaderKeys.push('x-vercel-protection-bypass');
    }
    for (const key of Object.keys(req.headers)){
        if (allowedRevalidateHeaderKeys.includes(key)) {
            revalidateHeaders[key] = req.headers[key];
        }
    }
    const internalRevalidate = context.internalRevalidate;
    try {
        // We use the revalidate in router-server if available.
        // If we are operating without router-server (serverless)
        // we must go through network layer with fetch request
        if (internalRevalidate) {
            return await internalRevalidate({
                urlPath,
                revalidateHeaders,
                opts
            });
        }
        if (context.trustHostHeader) {
            const res = await fetch(\`https://\${req.headers.host}\${urlPath}\`, {
                method: 'HEAD',
                headers: revalidateHeaders
            });
            // we use the cache header to determine successful revalidate as
            // a non-200 status code can be returned from a successful revalidate
            // e.g. notFound: true returns 404 status code but is successful
            const cacheHeader = res.headers.get('x-vercel-cache') || res.headers.get('x-nextjs-cache');
            if ((cacheHeader == null ? void 0 : cacheHeader.toUpperCase()) !== 'REVALIDATED' && res.status !== 200 && !(res.status === 404 && opts.unstable_onlyGenerated)) {
                throw Object.defineProperty(new Error(\`Invalid response \${res.status}\`), "__NEXT_ERROR_CODE", {
                    value: "E175",
                    enumerable: false,
                    configurable: true
                });
            }
        } else {
            throw Object.defineProperty(new Error(\`Invariant: missing internal router-server-methods this is an internal bug\`), "__NEXT_ERROR_CODE", {
                value: "E676",
                enumerable: false,
                configurable: true
            });
        }
    } catch (err) {
        throw Object.defineProperty(new Error(\`Failed to revalidate \${urlPath}: \${isError(err) ? err.message : err}\`), "__NEXT_ERROR_CODE", {
            value: "E240",
            enumerable: false,
            configurable: true
        });
    }
}`;

describe("patchPagesApiRuntimeProd", () => {
  describe("bundled res.revalidate code", () => {
    it("should patch trustHostHeader", async () => {
      expect(
        computePatchDiff(
          "pages-api.runtime.prod.js",
          pagesResRevalidateCodeBundled,
          trustHostHeaderRule,
        ),
      ).toMatchInlineSnapshot(`
      "Index: pages-api.runtime.prod.js
      ===================================================================
      --- pages-api.runtime.prod.js
      +++ pages-api.runtime.prod.js
      @@ -1,3 +1,2 @@
      -
       class NextNodeServer extends _baseserver.default {
      -async function tO(e,t,r,n){if("string"!=typeof e||!e.startsWith("/"))throw Object.defineProperty(Error(\`Invalid urlPath provided to revalidate(), must be a path e.g. /blog/post-1, received \${e}\`),"__NEXT_ERROR_CODE",{value:"E153",enumerable:!1,configurable:!0});let i={[x.y3]:n.previewModeId,...t.unstable_onlyGenerated?{[x.Qq]:"1"}:{}},a=[...n.allowedRevalidateHeaderKeys||[]];for(let e of((n.trustHostHeader||n.dev)&&a.push("cookie"),n.trustHostHeader&&a.push("x-vercel-protection-bypass"),Object.keys(r.headers)))a.includes(e)&&(i[e]=r.headers[e]);let s=n.internalRevalidate;try{if(s)return await s({urlPath:e,revalidateHeaders:i,opts:t});if(r.trustHostHeader){let n=await fetch(\`https://\${r.headers.host}\${e}\`,{method:"HEAD",headers:i}),a=n.headers.get("x-vercel-cache")||n.headers.get("x-nextjs-cache");if((null==a?void 0:a.toUpperCase())!=="REVALIDATED"&&200!==n.status&&!(404===n.status&&t.unstable_onlyGenerated))throw Object.defineProperty(Error(\`Invalid response \${n.status}\`),"__NEXT_ERROR_CODE",{value:"E175",enumerable:!1,configurable:!0})}else throw Object.defineProperty(Error("Invariant: missing internal router-server-methods this is an internal bug"),"__NEXT_ERROR_CODE",{value:"E676",enumerable:!1,configurable:!0})}catch(t){throw Object.defineProperty(Error(\`Failed to revalidate \${e}: \${t_(t)?t.message:t}\`),"__NEXT_ERROR_CODE",{value:"E240",enumerable:!1,configurable:!0})}}
      +async function tO(e,t,r,n){if("string"!=typeof e||!e.startsWith("/"))throw Object.defineProperty(Error(\`Invalid urlPath provided to revalidate(), must be a path e.g. /blog/post-1, received \${e}\`),"__NEXT_ERROR_CODE",{value:"E153",enumerable:!1,configurable:!0});let i={[x.y3]:n.previewModeId,...t.unstable_onlyGenerated?{[x.Qq]:"1"}:{}},a=[...n.allowedRevalidateHeaderKeys||[]];for(let e of((n.trustHostHeader||n.dev)&&a.push("cookie"),n.trustHostHeader&&a.push("x-vercel-protection-bypass"),Object.keys(r.headers)))a.includes(e)&&(i[e]=r.headers[e]);let s=n.internalRevalidate;try{if(s)return await s({urlPath:e,revalidateHeaders:i,opts:t});if(true){let n=await fetch(\`https://\${r.headers.host}\${e}\`,{method:"HEAD",headers:i}),a=n.headers.get("x-vercel-cache")||n.headers.get("x-nextjs-cache");if((null==a?void 0:a.toUpperCase())!=="REVALIDATED"&&200!==n.status&&!(404===n.status&&t.unstable_onlyGenerated))throw Object.defineProperty(Error(\`Invalid response \${n.status}\`),"__NEXT_ERROR_CODE",{value:"E175",enumerable:!1,configurable:!0})}else throw Object.defineProperty(Error("Invariant: missing internal router-server-methods this is an internal bug"),"__NEXT_ERROR_CODE",{value:"E676",enumerable:!1,configurable:!0})}catch(t){throw Object.defineProperty(Error(\`Failed to revalidate \${e}: \${t_(t)?t.message:t}\`),"__NEXT_ERROR_CODE",{value:"E240",enumerable:!1,configurable:!0})}}
      "
    `);
    });

    it("should set correct protocol", async () => {
      expect(
        computePatchDiff(
          "pages-api.runtime.prod.js",
          pagesResRevalidateCodeBundled,
          headFetchProtocolRule,
        ),
      ).toMatchInlineSnapshot(`
        "Index: pages-api.runtime.prod.js
        ===================================================================
        --- pages-api.runtime.prod.js
        +++ pages-api.runtime.prod.js
        @@ -1,3 +1,2 @@
        -
         class NextNodeServer extends _baseserver.default {
        -async function tO(e,t,r,n){if("string"!=typeof e||!e.startsWith("/"))throw Object.defineProperty(Error(\`Invalid urlPath provided to revalidate(), must be a path e.g. /blog/post-1, received \${e}\`),"__NEXT_ERROR_CODE",{value:"E153",enumerable:!1,configurable:!0});let i={[x.y3]:n.previewModeId,...t.unstable_onlyGenerated?{[x.Qq]:"1"}:{}},a=[...n.allowedRevalidateHeaderKeys||[]];for(let e of((n.trustHostHeader||n.dev)&&a.push("cookie"),n.trustHostHeader&&a.push("x-vercel-protection-bypass"),Object.keys(r.headers)))a.includes(e)&&(i[e]=r.headers[e]);let s=n.internalRevalidate;try{if(s)return await s({urlPath:e,revalidateHeaders:i,opts:t});if(r.trustHostHeader){let n=await fetch(\`https://\${r.headers.host}\${e}\`,{method:"HEAD",headers:i}),a=n.headers.get("x-vercel-cache")||n.headers.get("x-nextjs-cache");if((null==a?void 0:a.toUpperCase())!=="REVALIDATED"&&200!==n.status&&!(404===n.status&&t.unstable_onlyGenerated))throw Object.defineProperty(Error(\`Invalid response \${n.status}\`),"__NEXT_ERROR_CODE",{value:"E175",enumerable:!1,configurable:!0})}else throw Object.defineProperty(Error("Invariant: missing internal router-server-methods this is an internal bug"),"__NEXT_ERROR_CODE",{value:"E676",enumerable:!1,configurable:!0})}catch(t){throw Object.defineProperty(Error(\`Failed to revalidate \${e}: \${t_(t)?t.message:t}\`),"__NEXT_ERROR_CODE",{value:"E240",enumerable:!1,configurable:!0})}}
        +async function tO(e,t,r,n){if("string"!=typeof e||!e.startsWith("/"))throw Object.defineProperty(Error(\`Invalid urlPath provided to revalidate(), must be a path e.g. /blog/post-1, received \${e}\`),"__NEXT_ERROR_CODE",{value:"E153",enumerable:!1,configurable:!0});let i={[x.y3]:n.previewModeId,...t.unstable_onlyGenerated?{[x.Qq]:"1"}:{}},a=[...n.allowedRevalidateHeaderKeys||[]];for(let e of((n.trustHostHeader||n.dev)&&a.push("cookie"),n.trustHostHeader&&a.push("x-vercel-protection-bypass"),Object.keys(r.headers)))a.includes(e)&&(i[e]=r.headers[e]);let s=n.internalRevalidate;try{if(s)return await s({urlPath:e,revalidateHeaders:i,opts:t});if(r.trustHostHeader){let n=await fetch(\`\${r.headers["x-forwarded-proto"] || "https"}://\${r.headers.host}\${e}\`,{method:"HEAD",headers:i}),a=n.headers.get("x-vercel-cache")||n.headers.get("x-nextjs-cache");if((null==a?void 0:a.toUpperCase())!=="REVALIDATED"&&200!==n.status&&!(404===n.status&&t.unstable_onlyGenerated))throw Object.defineProperty(Error(\`Invalid response \${n.status}\`),"__NEXT_ERROR_CODE",{value:"E175",enumerable:!1,configurable:!0})}else throw Object.defineProperty(Error("Invariant: missing internal router-server-methods this is an internal bug"),"__NEXT_ERROR_CODE",{value:"E676",enumerable:!1,configurable:!0})}catch(t){throw Object.defineProperty(Error(\`Failed to revalidate \${e}: \${t_(t)?t.message:t}\`),"__NEXT_ERROR_CODE",{value:"E240",enumerable:!1,configurable:!0})}}
        "
      `);
    });
  });

  describe("unbundled res.revalidate code", () => {
    it("should patch trustHostHeader", async () => {
      expect(
        computePatchDiff(
          "pages-api.runtime.prod.js",
          pagesResRevalidateCodeUnbundled,
          trustHostHeaderRule,
        ),
      ).toMatchInlineSnapshot(`
        "Index: pages-api.runtime.prod.js
        ===================================================================
        --- pages-api.runtime.prod.js
        +++ pages-api.runtime.prod.js
        @@ -1,5 +1,4 @@
        -
         async function revalidate(urlPath, opts, req, context) {
             if (typeof urlPath !== 'string' || !urlPath.startsWith('/')) {
                 throw Object.defineProperty(new Error(\`Invalid urlPath provided to revalidate(), must be a path e.g. /blog/post-1, received \${urlPath}\`), "__NEXT_ERROR_CODE", {
                     value: "E153",
        @@ -38,9 +37,9 @@
                         revalidateHeaders,
                         opts
                     });
                 }
        -        if (context.trustHostHeader) {
        +        if (true) {
                     const res = await fetch(\`https://\${req.headers.host}\${urlPath}\`, {
                         method: 'HEAD',
                         headers: revalidateHeaders
                     });
        "
      `);
    });

    it("should set correct protocol", async () => {
      expect(
        computePatchDiff(
          "pages-api.runtime.prod.js",
          pagesResRevalidateCodeUnbundled,
          headFetchProtocolRule,
        ),
      ).toMatchInlineSnapshot(`
        "Index: pages-api.runtime.prod.js
        ===================================================================
        --- pages-api.runtime.prod.js
        +++ pages-api.runtime.prod.js
        @@ -1,5 +1,4 @@
        -
         async function revalidate(urlPath, opts, req, context) {
             if (typeof urlPath !== 'string' || !urlPath.startsWith('/')) {
                 throw Object.defineProperty(new Error(\`Invalid urlPath provided to revalidate(), must be a path e.g. /blog/post-1, received \${urlPath}\`), "__NEXT_ERROR_CODE", {
                     value: "E153",
        "
      `);
    });
  });
});
