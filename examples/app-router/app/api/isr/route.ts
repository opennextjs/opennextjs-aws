import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// This endpoint simulates an on demand revalidation request
export async function GET(request: NextRequest) {
  const cwd = process.cwd();
  const prerenderManifest = await fs.readFile(
    path.join(cwd, ".next/prerender-manifest.json"),
    "utf-8",
  );
  const manifest = JSON.parse(prerenderManifest);
  const previewId = manifest.preview.previewModeId;

  const result = await fetch(
    `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers.get("host")}/isr`,
    {
      headers: { "x-prerender-revalidate": previewId },
      method: "HEAD",
    },
  );

  return NextResponse.json({
    status: 200,
    body: {
      result: result.ok,
      cacheControl: result.headers.get("cache-control"),
    },
  });
}
