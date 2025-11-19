import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

export default function proxy(request: NextRequest) {
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

  return NextResponse.next({
    headers: {
      "x-middleware-test": "1",
      "x-random-node": crypto.randomUUID(),
    },
  });
}
