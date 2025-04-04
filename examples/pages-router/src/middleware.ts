import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.headers.get("x-throw")) {
    throw new Error("Middleware error");
  }
  return NextResponse.next({
    headers: {
      "x-from-middleware": "true",
    },
  });
}

export const config = {
  matcher: ["/"],
};
