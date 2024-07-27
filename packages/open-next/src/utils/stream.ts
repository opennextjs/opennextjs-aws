import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";

export function fromReadableStream(
  stream: ReadableStream<Uint8Array>,
  base64?: boolean,
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  return new Promise((resolve, reject) => {
    function pump() {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            resolve(Buffer.concat(chunks).toString(base64 ? "base64" : "utf8"));
            return;
          }
          chunks.push(value);
          pump();
        })
        .catch(reject);
    }
    pump();
  });
}

export function toReadableStream(
  value: string,
  isBase64?: boolean,
): ReadableStream {
  return Readable.toWeb(
    Readable.from(Buffer.from(value, isBase64 ? "base64" : "utf8")),
  );
}

export function emptyReadableStream(): ReadableStream {
  return Readable.toWeb(Readable.from([]));
}
