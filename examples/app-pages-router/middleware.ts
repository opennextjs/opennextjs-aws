import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Needed to test top-level await
// We are using `setTimeout` to simulate a "long" running operation
// we could have used `Promise.resolve` instead, but it would be running in a different way in the event loop
// @ts-expect-error - It will cause a warning at build time, but it should just work
const topLevelAwait = await new Promise<string>((resolve) => {
  setTimeout(() => {
    resolve("top-level-await");
  }, 10);
});

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname; //new URL(request.url).pathname;

  const host = request.headers.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  if (path === "/redirect") {
    const u = new URL("/redirect-destination", `${protocol}://${host}`);
    return NextResponse.redirect(u, {
      headers: { "set-cookie": "test=success" },
    });
  }
  if (path === "/rewrite") {
    const u = new URL("/rewrite-destination", `${protocol}://${host}`);
    u.searchParams.set("a", "b");
    return NextResponse.rewrite(u);
  }
  if (path === "/rewrite-multi-params") {
    const u = new URL("/rewrite-destination", `${protocol}://${host}`);
    u.searchParams.append("multi", "0");
    u.searchParams.append("multi", "1");
    u.searchParams.append("multi", "2");
    u.searchParams.set("a", "b");
    return NextResponse.rewrite(u);
  }
  if (path === "/api/middleware") {
    return new NextResponse(JSON.stringify({ hello: "middleware" }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }
  if (path === "/api/middlewareTopLevelAwait") {
    return new NextResponse(JSON.stringify({ hello: topLevelAwait }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  if (path === "/head" && request.method === "HEAD") {
    return new NextResponse(null, {
      headers: {
        "x-from-middleware": "true",
      },
    });
  }

  if (path === "/fetch") {
    // This one test both that we don't modify immutable headers
    return fetch(new URL("/api/hello", request.url));
  }
  const rHeaders = new Headers(request.headers);
  const r = NextResponse.next({
    request: {
      headers: rHeaders,
    },
  });
  return r;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|match|static|fonts|api/auth|og).*)"],
};
