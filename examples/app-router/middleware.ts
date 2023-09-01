import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname; //new URL(request.url).pathname;

  const host = request.headers.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  if (path === "/redirect") {
    const u = new URL("/redirect-destination", `${protocol}://${host}`);
    return NextResponse.redirect(u);
  } else if (path === "/rewrite") {
    const u = new URL("/rewrite-destination", `${protocol}://${host}`);
    return NextResponse.rewrite(u);
  } else if (path === "/api/middleware") {
    return new NextResponse(JSON.stringify({ hello: "middleware" }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  const requestHeaders = new Headers();
  requestHeaders.set("request-header", "request-header");
  requestHeaders.set(
    "search-params",
    `mw/${request.nextUrl.searchParams.get("searchParams") || ""}`,
  );
  const responseHeaders = new Headers();
  responseHeaders.set("response-header", "response-header");
  const r = NextResponse.next({
    headers: responseHeaders,
    request: {
      headers: requestHeaders,
    },
  });
  return r;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|match|static|fonts|api/auth|og).*)"],
};
