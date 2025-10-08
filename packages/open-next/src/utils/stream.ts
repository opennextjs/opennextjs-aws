import { ReadableStream } from "node:stream/web";

export async function fromReadableStream(
  stream: ReadableStream<Uint8Array>,
  base64?: boolean,
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }

    if (chunks.length === 0) {
      return "";
    }

    if (chunks.length === 1) {
      return Buffer.from(chunks[0]).toString(base64 ? "base64" : "utf8");
    }

    // Pre-allocate buffer with exact size to avoid reallocation
    const buffer = Buffer.allocUnsafe(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    return buffer.toString(base64 ? "base64" : "utf8");
  } finally {
    reader.releaseLock();
  }
}

export function toReadableStream(
  value: string,
  isBase64?: boolean,
): ReadableStream {
  const buffer = Buffer.from(value, isBase64 ? "base64" : "utf8");

  return new ReadableStream({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    },
  });
}

let maybeSomethingBuffer: Buffer | undefined;

export function emptyReadableStream(): ReadableStream {
  if (process.env.OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE === "true") {
    return new ReadableStream({
      start(controller) {
        maybeSomethingBuffer ??= Buffer.from("SOMETHING");
        controller.enqueue(maybeSomethingBuffer);
        controller.close();
      },
    });
  }
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}
