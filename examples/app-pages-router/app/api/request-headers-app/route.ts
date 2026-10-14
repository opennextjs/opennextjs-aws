import { NextResponse } from "next/server";

/**
 * Returns middleware-adjusted headers observed by an App Router handler.
 *
 * @param request The request forwarded by middleware.
 * @return A response containing the relevant request-header values.
 */
export function GET(request: Request) {
  return NextResponse.json({
    untrustedIdentity: request.headers.get("x-untrusted-identity"),
    middlewareAdded: request.headers.get("x-middleware-added"),
  });
}
