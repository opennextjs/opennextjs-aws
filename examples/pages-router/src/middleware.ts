import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  return NextResponse.next({
    headers: {
      "x-from-middleware": "true",
    },
  });
}

export const config = {
  matcher: ["/"],
};
