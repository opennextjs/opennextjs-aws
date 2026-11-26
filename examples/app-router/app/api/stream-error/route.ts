export const dynamic = "force-dynamic";

// The body stream errors before its first chunk
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      controller.error(new Error("stream error"));
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "s-maxage=3600",
      "set-cookie": "session=secret",
    },
  });
}
