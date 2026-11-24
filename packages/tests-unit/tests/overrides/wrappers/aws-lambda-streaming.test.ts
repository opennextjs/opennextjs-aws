import { Writable } from "node:stream";
import { gunzipSync } from "node:zlib";

import { OpenNextNodeResponse } from "@opennextjs/aws/http/openNextResponse.js";
import type {
  InternalEvent,
  StreamCreator,
} from "@opennextjs/aws/types/open-next.js";
import type { Converter } from "@opennextjs/aws/types/overrides.js";
import { vi } from "vitest";

vi.stubGlobal("awslambda", {
  streamifyResponse: (handler: unknown) => handler,
});

/**
 * Runs a request through the wrapper.
 *
 * @param acceptEncoding The `accept-encoding` request header
 * @param handler Populates the response
 * @returns The prelude and the body written to the Lambda response stream
 */
async function invoke(
  acceptEncoding: string,
  handler: (res: OpenNextNodeResponse) => void,
) {
  const { default: awsLambdaStreaming } = await import(
    "@opennextjs/aws/overrides/wrappers/aws-lambda-streaming.js"
  );
  const chunks: Buffer[] = [];
  const responseStream = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    }),
    { setContentType: () => {} },
  );
  const finished = new Promise((resolve) =>
    responseStream.on("finish", resolve),
  );
  const lambda = await awsLambdaStreaming.wrapper(
    async (
      _event: InternalEvent,
      options?: { streamCreator?: StreamCreator },
    ) => {
      const res = new OpenNextNodeResponse(
        () => {},
        async () => {},
        options?.streamCreator,
      );
      res.on("error", () => {});
      handler(res);
      return {} as never;
    },
    {
      convertFrom: async () => ({
        headers: { "accept-encoding": acceptEncoding },
      }),
    } as unknown as Converter,
  );
  await lambda({}, responseStream, {});
  await finished;

  const raw = Buffer.concat(chunks);
  // The prelude is followed by 8 null bytes
  const separator = raw.indexOf(Buffer.alloc(8));
  return {
    prelude: JSON.parse(raw.subarray(0, separator).toString()),
    body: raw.subarray(separator + 8),
  };
}

describe("wrappers/aws-lambda-streaming", () => {
  it.each([
    ["identity", "", (body: Buffer) => body],
    ["gzip", "gzip", (body: Buffer) => gunzipSync(body)],
  ])(
    "sends a 500 when the response is destroyed before the headers (%s)",
    async (contentEncoding, acceptEncoding, decode) => {
      const { prelude, body } = await invoke(acceptEncoding, (res) => {
        res.setHeader("set-cookie", ["session=secret"]);
        res.destroy(new Error("boom"));
      });

      expect(prelude).toEqual({
        statusCode: 500,
        cookies: [],
        headers: {
          "cache-control":
            "private, no-cache, no-store, max-age=0, must-revalidate",
          "content-encoding": contentEncoding,
        },
      });
      expect(decode(body).toString()).toBe("");
    },
  );
});
