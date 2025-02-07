import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// This endpoint simulates an on demand revalidation request
export async function GET(request: NextRequest) {
  let manifest: { preview: { previewModeId: string } };
  // This fails at build time when next.js tries to evaluate the route
  try {
    const prerenderManifest = await import(
      // @ts-expect-error
      /* webpackIgnore: true */ "../../../../prerender-manifest.json",
      { assert: { type: "json" } }
    );
    manifest = prerenderManifest.default;
  } catch (e) {
    console.error(e);
    return new Response(null, { status: 500 });
  }

  const previewId = manifest.preview.previewModeId;

  const host = request.headers.get("host") ?? "localhost:3001";
  const result = await fetch(
    `http${host?.includes("localhost") ? "" : "s"}://${host}/isr`,
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
