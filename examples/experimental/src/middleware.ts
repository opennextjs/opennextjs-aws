import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

export default function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/hello") {
    return NextResponse.json({
      name: "World",
    });
  }
  if (request.nextUrl.pathname === "/redirect") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (request.nextUrl.pathname === "/rewrite") {
    return NextResponse.rewrite(new URL("/", request.url));
  }

  const headers: Record<string, string> = {
    "x-middleware-test": "1",
    "x-random-node": crypto.randomUUID(),
  };

  // It is so that cloudfront doesn't cache the response
  if (request.nextUrl.pathname.startsWith("/use-cache/on-demand")) {
    headers["cache-control"] =
      "private, no-cache, no-store, max-age=0, must-revalidate";
  }

  return NextResponse.next({ headers });
}

export const config = {
  runtime: "nodejs",
};
