import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.headers.get("x-throw")) {
    throw new Error("Middleware error");
  }

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/rewrite-client-path")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(
      /^\/rewrite-client-path/,
      "/rewrite-code-path",
    );
    return NextResponse.rewrite(url);
  }

  return NextResponse.next({
    headers: {
      "x-from-middleware": "true",
      "cache-control": "private, no-store",
    },
  });
}

export const config = {
  matcher: ["/", "/rewrite-client-path/:path*"],
};
