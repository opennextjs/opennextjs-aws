import { NextResponse } from "next/server";

// Guarded by an exact pathname check in the proxy.
// For: trailing.test.ts
export async function GET() {
  return NextResponse.json({ secret: "top-secret" });
}
