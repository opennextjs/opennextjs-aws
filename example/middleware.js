import { NextResponse } from "next/server";

export async function middleware(request) {
  if (request.nextUrl.pathname === "/middleware-redirect") {
    return NextResponse.redirect(new URL("/middleware-redirect-destination", request.url));
  }
  if (request.nextUrl.pathname === "/middleware-set-header") {
    // Clone the request headers and set a new header `x-hello-from-middleware1`
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-hello-from-middleware1", "hello");
  
    // You can also set request headers in NextResponse.rewrite
    const response = NextResponse.next({
      request: {
        // New request headers
        headers: requestHeaders,
      },
    });
  
    // Set a new response header `x-hello-from-middleware2`
    response.headers.set("x-hello-from-middleware2", "hello");
    return response;
  }
  if (request.nextUrl.pathname === "/middleware-fetch") {
    console.log(await fetch("https://webhook.site/facbcacc-08f2-4fb1-b67f-a26e3382b64e"));
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/middleware-redirect", "/middleware-set-header", "/middleware-fetch"],
}