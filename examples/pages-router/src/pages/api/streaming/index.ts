import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
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
    yield encoder.encode(`<p data-testid="iteratorCount">${i}</p>`);
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

  // we need to import ReadableStream from `node:stream/web` to make TypeScript happy
  return Readable.fromWeb(stream).pipe(res);
}
