import { Writable } from "node:stream";

import { convertRes } from "@opennextjs/aws/core/routing/util.js";
import { OpenNextNodeResponse } from "@opennextjs/aws/http/openNextResponse.js";
import type { StreamCreator } from "@opennextjs/aws/types/open-next.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {},
}));

const NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate";

type Prelude = Parameters<StreamCreator["writeHeaders"]>[0];

/**
 * Creates a response with a `StreamCreator` recording what the wrapper receives.
 *
 * @param abortSignal The signal of the client request
 * @returns The response, the preludes passed to `writeHeaders` and the body written
 */
function setup(abortSignal?: AbortSignal) {
  const preludes: Prelude[] = [];
  const body = { text: "", ended: false };
  const streamCreator: StreamCreator = {
    writeHeaders: (prelude) => {
      preludes.push(prelude);
      return new Writable({
        write(chunk, _encoding, callback) {
          body.text += chunk;
          callback();
        },
        final(callback) {
          body.ended = true;
          callback();
        },
      });
    },
    abortSignal,
  };
  const res = new OpenNextNodeResponse(
    () => {},
    async () => {},
    streamCreator,
    { "set-cookie": "mw=1" },
  );
  // `destroy(error)` emits an "error" event
  res.on("error", () => {});
  const closed = new Promise((resolve) => res.on("close", resolve));
  return { res, preludes, body, closed };
}

describe("OpenNextNodeResponse destroy", () => {
  it("sends an empty non-cacheable 500 when destroyed before the headers", async () => {
    const { res, preludes, body, closed } = setup();
    const onError = vi.fn();
    res.on("error", onError);
    res.setHeader("content-length", "1234");
    res.setHeader("cache-control", "s-maxage=31536000");
    res.setHeader("set-cookie", ["session=secret"]);

    const error = new Error("boom");
    res.destroy(error);
    // Like Next.js rendering the error page in the destroyed response
    res.end("error page");
    await closed;

    expect(preludes).toEqual([
      { statusCode: 500, cookies: [], headers: { "cache-control": NO_STORE } },
    ]);
    expect(body).toEqual({ text: "", ended: true });
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("returns a non-cacheable 500 to non-streaming wrappers", async () => {
    const res = new OpenNextNodeResponse(
      () => {},
      async () => {},
    );
    res.on("error", () => {});
    res.setHeader("cache-control", "s-maxage=31536000");
    res.setHeader("set-cookie", ["session=secret"]);

    res.destroy(new Error("boom"));
    const { statusCode, headers } = convertRes(res);

    expect(statusCode).toBe(500);
    expect(headers).toEqual({ "cache-control": NO_STORE, "set-cookie": "" });
  });

  it("does not respond when the client has disconnected", async () => {
    const controller = new AbortController();
    const { preludes, closed } = setup(controller.signal);

    controller.abort();
    await closed;

    expect(preludes).toEqual([]);
  });

  it("does not change a response whose headers were sent", async () => {
    const { res, preludes, body, closed } = setup();

    res.write("partial");
    res.destroy(new Error("boom"));
    await closed;

    expect(preludes).toHaveLength(1);
    expect(preludes[0].statusCode).toBe(200);
    expect(body.text).toBe("partial");
  });

  it("is a no-op after a normal response", async () => {
    const { res, preludes, body, closed } = setup();

    res.end("hello");
    // `autoDestroy` destroys the stream
    await closed;

    expect(preludes).toHaveLength(1);
    expect(preludes[0].statusCode).toBe(200);
    expect(body).toEqual({ text: "hello", ended: true });
  });

  it("still destroys the stream when the wrapper throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const res = new OpenNextNodeResponse(
      () => {},
      async () => {},
      {
        writeHeaders: () => {
          throw new Error("closed");
        },
      },
    );
    const closed = new Promise((resolve) => res.on("close", resolve));

    // No "error" event, which would be unhandled
    res.destroy();
    await closed;

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to send the response",
      expect.objectContaining({ message: "closed" }),
    );
    consoleError.mockRestore();
  });
});
