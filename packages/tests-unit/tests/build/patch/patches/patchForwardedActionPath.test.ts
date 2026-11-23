import { runInNewContext } from "node:vm";

import { describe, expect, test, vi } from "vitest";

import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import {
  dynamicSegmentsReplacement,
  rule,
} from "@opennextjs/aws/build/patch/patches/patchForwardedActionPath.js";
import { hasRouteParamPlaceholder } from "@opennextjs/aws/core/routing/routeParamPlaceholder.js";
import { computePatchDiff } from "./util.js";

vi.mock("@opennextjs/aws/core/routing/routeMatcher.js", () => ({
  dynamicRouteMatcher: vi.fn(() => [
    { route: "/items/[id]/edit", type: "app" },
  ]),
}));

// source: next@16.4.6 dist/compiled/next-server/app-page.runtime.prod.js
const minifiedForward = `async function tQ(e,t,r,n,a,i){if(!r)throw Error("Invariant: Missing \`host\` header from a forwarded Server Actions request.");let s=tY(e,t);s.set("x-action-forwarded","1");let o=process.env.__NEXT_PRIVATE_ORIGIN;if(void 0===o){let t=(0,R.Ny)(e,"initURL");if(void 0!==t)try{o=new URL(t).origin}catch(e){throw Error("Could not determine origin for forwarded Server Actions request. This can happen if port or hostname are not configured for this server.",{cause:e})}else throw new Y.z("Missing initURL")}let l=new URL(\`\${o}\${a}\${n}\`);try{var u,c;let r;{let t=(0,R.Ny)(e,"actionBody");t?(r=new Uint8Array(t),s.delete(tr.gs),s.delete(tr.T8)):r=e.stream()}let n=await fetch(l,{method:"POST",body:r,duplex:"half",headers:s,redirect:"manual",next:{internal:1}});if(null==(u=n.headers.get("content-type"))?void 0:u.startsWith(ej.al)){for(let[e,r]of n.headers)tU.includes(e)||t.setHeader(e,r);return new tl(n.body)}if(null==(c=n.body)||c.cancel(),"1"===n.headers.get(ej.Ic)){t.setHeader(ej.Ic,"1"),t.setHeader("content-type","text/plain");let e=tX(i);return t.statusCode=e,Z.fromStatic(tK(e),"text/plain")}}catch(e){console.error("failed to forward action response",e)}return Z.fromStatic("{}",tr.U2)}`;

/**
 * Runs the forwarding function of the minified runtime.
 *
 * @returns the URL the action is forwarded to
 */
async function getForwardedUrl(
  code: string,
  { basePath, workerPathname }: { basePath: string; workerPathname: string },
): Promise<URL> {
  const fetch = vi.fn(async (_url: URL) => new Response(null));
  const forward = runInNewContext(`(${code})`, {
    URL,
    fetch,
    process: { env: { __NEXT_PRIVATE_ORIGIN: "https://example.com" } },
    // `getForwardedHeaders`
    tY: () => new Headers(),
    // `getRequestMeta`
    R: { Ny: () => undefined },
    ej: {},
    tr: {},
    Z: { fromStatic: (body: string) => body },
  });
  await forward(
    { stream: () => null },
    {},
    "example.com",
    workerPathname,
    basePath,
    "action-id",
  );
  expect(fetch).toHaveBeenCalledOnce();
  return fetch.mock.calls[0][0];
}

describe("patchForwardedActionPath", () => {
  test("the unpatched runtime forwards to the route pattern, which the routing layer rejects", async () => {
    const url = await getForwardedUrl(minifiedForward, {
      basePath: "",
      workerPathname: "/items/[id]/edit",
    });

    expect(url.href).toBe("https://example.com/items/[id]/edit");
    expect(hasRouteParamPlaceholder(url.pathname)).toBe(true);
  });

  test("the patched runtime forwards to a path the routing layer accepts", async () => {
    const url = await getForwardedUrl(patchCode(minifiedForward, rule), {
      basePath: "",
      workerPathname: "/items/[id]/edit",
    });

    expect(url.href).toBe("https://example.com/items/_forwarded-action/edit");
    expect(hasRouteParamPlaceholder(url.pathname)).toBe(false);
  });

  test.each([
    {
      name: "multiple dynamic segments",
      workerPathname: "/[lang]/items/[id]",
      path: "/_forwarded-action/items/_forwarded-action",
    },
    {
      name: "a catch-all segment",
      workerPathname: "/docs/[...slug]",
      path: "/docs/_forwarded-action/_forwarded-action",
    },
    {
      name: "an optional catch-all segment",
      workerPathname: "/docs/[[...slug]]",
      path: "/docs/_forwarded-action/_forwarded-action",
    },
    {
      name: "a catch-all segment after a dynamic segment",
      workerPathname: "/[lang]/docs/[...slug]",
      path: "/_forwarded-action/docs/_forwarded-action/_forwarded-action",
    },
    {
      name: "a static route",
      workerPathname: "/items/new",
      path: "/items/new",
    },
  ])(
    "the patched runtime forwards $name to $path",
    async ({ workerPathname, path }) => {
      const url = await getForwardedUrl(patchCode(minifiedForward, rule), {
        basePath: "/base",
        workerPathname,
      });

      expect(url.href).toBe(`https://example.com/base${path}`);
    },
  );

  test("only the path is rewritten in minified code", () => {
    expect(patchCode(minifiedForward, rule)).toBe(
      minifiedForward.replace(
        "new URL(`${o}${a}${n}`)",
        `new URL(\`\${o}\${a}\${n${dynamicSegmentsReplacement}}\`)`,
      ),
    );
  });

  test("on unminified code", () => {
    // source: next@16.4.6 dist/server/app-render/action-handler.js (shortened)
    const code = `async function createForwardedActionResponse(req, res, host, workerPathname, basePath, actionId) {
    const forwardedHeaders = getForwardedHeaders(req, res);
    // indicate that this action request was forwarded from another worker
    forwardedHeaders.set('x-action-forwarded', '1');
    let origin = process.env.__NEXT_PRIVATE_ORIGIN;
    const fetchUrl = new URL(\`\${origin}\${basePath}\${workerPathname}\`);
    return fetch(fetchUrl, { method: 'POST', headers: forwardedHeaders });
}
`;

    expect(
      computePatchDiff("action-handler.js", code, rule),
    ).toMatchInlineSnapshot(`
      "Index: action-handler.js
      ===================================================================
      --- action-handler.js
      +++ action-handler.js
      @@ -2,7 +2,7 @@
           const forwardedHeaders = getForwardedHeaders(req, res);
           // indicate that this action request was forwarded from another worker
           forwardedHeaders.set('x-action-forwarded', '1');
           let origin = process.env.__NEXT_PRIVATE_ORIGIN;
      -    const fetchUrl = new URL(\`\${origin}\${basePath}\${workerPathname}\`);
      +    const fetchUrl = new URL(\`\${origin}\${basePath}\${workerPathname.replace(/\\[+\\.{3}[^\\]]+\\]+/g, "_forwarded-action/_forwarded-action").replace(/\\[[^\\]]+\\]/g, "_forwarded-action")}\`);
           return fetch(fetchUrl, { method: 'POST', headers: forwardedHeaders });
       }
      "
    `);
  });

  test("does not patch the request following a redirect", () => {
    // source: next@16.4.6 dist/compiled/next-server/app-page.runtime.prod.js (shortened)
    const code = `async function tZ(e,t,r,n,a,i,s,o){let n=tY(e,t);n.set(ej.hY,"1");let a=process.env.__NEXT_PRIVATE_ORIGIN;let i=new URL(\`\${a}\${l.pathname}\${l.search}\`);return fetch(i,{method:"GET",headers:n,next:{internal:1}})}`;

    expect(patchCode(code, rule)).toBe(code);
  });

  test("does not patch a URL built outside of the forwarding function", () => {
    const code = `function f(a,b,c){return new URL(\`\${a}\${b}\${c}\`)}function g(h){h.set("x-action-forwarded","1")}`;

    expect(patchCode(code, rule)).toBe(code);
  });

  test("does not patch already patched code", () => {
    const patched = patchCode(minifiedForward, rule);

    expect(patchCode(patched, rule)).toBe(patched);
  });
});
