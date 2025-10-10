import { ReadableStream } from "node:stream/web";

export async function fromReadableStream(
  stream: ReadableStream<Uint8Array>,
  base64?: boolean,
): Promise<string> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for await (const chunk of stream) {
    chunks.push(chunk);
    totalLength += chunk.length;
  }

  if (chunks.length === 0) {
    return "";
  }

  if (chunks.length === 1) {
    return Buffer.from(chunks[0]).toString(base64 ? "base64" : "utf8");
  }

  // Use Buffer.concat which is more efficient than manual allocation and copy
  // It handles the allocation and copy in optimized native code
  const buffer = Buffer.concat(chunks, totalLength);

  return buffer.toString(base64 ? "base64" : "utf8");
}

export function toReadableStream(
  value: string,
  isBase64?: boolean,
): ReadableStream {
  return new ReadableStream(
    {
      pull(controller) {
        // Defer the Buffer.from conversion to when the stream is actually read.
        controller.enqueue(Buffer.from(value, isBase64 ? "base64" : "utf8"));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
}

let maybeSomethingBuffer: Buffer | undefined;

export function emptyReadableStream(): ReadableStream {
  if (process.env.OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE === "true") {
    return new ReadableStream(
      {
        pull(controller) {
          maybeSomethingBuffer ??= Buffer.from("SOMETHING");
          controller.enqueue(maybeSomethingBuffer);
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
  }
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}
