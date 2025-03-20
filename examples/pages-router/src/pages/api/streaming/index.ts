import { Readable } from "node:stream";
import type { NextApiRequest, NextApiResponse } from "next";

function iteratorToStream(iterator: AsyncIterator<Uint8Array>) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();

      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  });
}

function sleep(time: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

const encoder = new TextEncoder();

async function* makeIterator() {
  for (let i = 1; i <= 10; i++) {
    const timestamp = Date.now();
    yield encoder.encode(
      `<p data-testid="iteratorCount" data-timestamp="${timestamp}">${i}</p>`,
    );
    await sleep(1000);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Cache-Control", "no-cache, no-transform");

  // create and pipe the stream
  const iterator = makeIterator();
  const stream = iteratorToStream(iterator);

  // @ts-ignore - not sure how to make typescript happy here
  return Readable.fromWeb(stream).pipe(res);
}
