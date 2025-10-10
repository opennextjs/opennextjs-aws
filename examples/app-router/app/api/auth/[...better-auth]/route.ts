import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ "better-auth": string[] }> },
) {
  const { "better-auth": slugs } = await params;

  return NextResponse.json({
    slugs,
  });
}
