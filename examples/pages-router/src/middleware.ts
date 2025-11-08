import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.headers.get("x-throw")) {
    throw new Error("Middleware error");
  }
  return NextResponse.next({
    headers: {
      "x-from-middleware": "true",
      // We need to disable caching in cloudfront to ensure we always hit the origin for this test
      "cache-control": "private, no-store",
    },
  });
}

export const config = {
  matcher: ["/"],
};
