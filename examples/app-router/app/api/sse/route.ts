import { wait } from "@open-next/utils";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const resStream = new TransformStream();
  const writer = resStream.writable.getWriter();

  const res = new Response(resStream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });

  setTimeout(async () => {
    await writer.write(
      `data: ${JSON.stringify({
        message: "open",
        time: new Date().toISOString(),
      })}\n\n`,
    );
    for (let i = 1; i <= 4; i++) {
      await wait(2000);
      await writer.write(
        `data: ${JSON.stringify({
          message: "hello:" + i,
          time: new Date().toISOString(),
        })}\n\n`,
      );
    }

    await wait(2000); // Wait for 4 seconds
    await writer.write(
      `data: ${JSON.stringify({
        message: "close",
        time: new Date().toISOString(),
      })}\n\n`,
    );
    await wait(5000);
    await writer.close();
  }, 100);

  return res;
}
