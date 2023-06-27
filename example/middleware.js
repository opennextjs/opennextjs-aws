import { NextResponse } from "next/server";

export async function middleware(request) {
  if (request.nextUrl.pathname === "/middleware-rewrite") {
    const { nextUrl: url } = request
    url.searchParams.set("rewritten", "true")
    return NextResponse.rewrite(url);
  }
  if (request.nextUrl.pathname === "/middleware-rewrite-with-isr") {
    const { nextUrl: url } = request
    url.pathname = `/middleware-rewrite-with-isr-destination`
    return NextResponse.rewrite(url)
  }
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
  if (request.nextUrl.pathname === "/middleware-geolocation") {
    const { nextUrl: url, geo } = request
    //console.log("== request", request);
    //console.log("== geo", geo);
    const country = geo.country || "US"
    const city = geo.city || "San Francisco"
    const region = geo.region || "CA"
  
    url.searchParams.set('country', country)
    url.searchParams.set('city', city)
    url.searchParams.set('region', region)
  
    return NextResponse.rewrite(url);
  }
}

export const config = {
  matcher: [
    "/middleware-rewrite",
    "/middleware-rewrite-with-isr",
    "/middleware-redirect",
    "/middleware-set-header",
    "/middleware-fetch",
    "/middleware-geolocation",
  ],
}