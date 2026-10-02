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

/**
 * Applies middleware behavior used by the mixed-router test application.
 *
 * @param request Incoming Next.js request.
 * @return A middleware response, rewrite, redirect, or proxied response.
 */
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
  const responseHeaders = new Headers();
  // Keep origin-cache tests out of CloudFront so repeated requests exercise
  // cacheInterceptor. The encoded spelling selects the catch-all route.
  if (
    path === "/albums" ||
    path.startsWith("/cache-victim/") ||
    path.startsWith("/%63ache-victim/")
  ) {
    responseHeaders.set(
      "cache-control",
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
  }
  const r = NextResponse.next({
    headers: responseHeaders,
    request: {
      headers: rHeaders,
    },
  });
  return r;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|match|static|fonts|api/auth|og).*)"],
};
