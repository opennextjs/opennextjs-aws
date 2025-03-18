import type { NextRequest } from "next/server";

export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query");
  if (query === "OpenNext is awesome!") {
    return Response.json({ query });
  }
  return new Response("Internal Server Error", { status: 500 });
}
