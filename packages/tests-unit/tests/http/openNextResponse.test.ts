import { Writable } from "node:stream";

import { OpenNextNodeResponse } from "@opennextjs/aws/http/openNextResponse.js";
import type { StreamCreator } from "@opennextjs/aws/types/open-next.js";
import { afterEach, vi } from "vitest";

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
    (headers) => {
      headers["x-opennext"] = "1";
    },
    async () => {},
    streamCreator,
    { "set-cookie": "mw=1", "x-middleware": "1" },
  );
  const closed = new Promise((resolve) => res.on("close", resolve));
  return { res, preludes, body, closed };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OpenNextNodeResponse destroy", () => {
  it("sends an empty non-cacheable 500 when destroyed with an error before the headers", async () => {
    const { res, preludes, body, closed } = setup();
    const onError = vi.fn();
    res.on("error", onError);
    res.setHeader("content-length", "1234");
    res.setHeader("cache-control", "s-maxage=31536000");
    res.setHeader("set-cookie", ["session=secret"]);

    const error = new Error("boom");
    res.destroy(error);
    // Like Next.js rendering an error page in the destroyed response
    res.statusCode = 500;
    res.writeHead(404, { "x-late": "1" });
    res.setHeader("set-cookie", ["late=1"]);
    res.end("error page");
    await closed;

    expect(preludes).toEqual([
      {
        statusCode: 500,
        cookies: [],
        headers: { "cache-control": NO_STORE, "x-opennext": "1" },
      },
    ]);
    expect(body).toEqual({ text: "", ended: true });
    // An unhandled "error" event would be an uncaught exception
    expect(onError).not.toHaveBeenCalled();
    expect(res.errored).toBe(error);
  });

  it("writes a body when OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE is set", async () => {
    vi.stubEnv("OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE", "true");
    const { res, body, closed } = setup();

    res.destroy(new Error("boom"));
    await closed;

    expect(body).toEqual({ text: "SOMETHING", ended: true });
  });

  it("honors OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS", async () => {
    vi.stubEnv("OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS", "true");
    const { res, preludes, closed } = setup();

    res.destroy(new Error("boom"));
    await closed;

    expect(preludes[0].headers).toEqual({ "x-opennext": "1" });
  });

  it("does not respond when destroyed without an error", async () => {
    const { res, preludes, closed } = setup();

    res.destroy();
    await closed;

    expect(preludes).toEqual([]);
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
    const error = new Error("boom");
    const onError = vi.fn();
    res.on("error", onError);

    res.write("partial");
    res.destroy(error);
    await closed;

    expect(preludes).toHaveLength(1);
    expect(preludes[0].statusCode).toBe(200);
    expect(body.text).toBe("partial");
    expect(onError).toHaveBeenCalledWith(error);
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
    res.destroy(new Error("boom"));
    await closed;

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to send the response",
      expect.objectContaining({ message: "closed" }),
    );
    consoleError.mockRestore();
  });
});

function createResponse(statusCode?: number) {
  return new OpenNextNodeResponse(
    () => {},
    async () => {},
    undefined,
    undefined,
    statusCode,
  );
}

describe("OpenNextNodeResponse statusCode", () => {
  it("is undefined until a status code is set", () => {
    expect(createResponse().statusCode).toBeUndefined();
  });

  it("uses the initial status code", () => {
    expect(createResponse(404).statusCode).toBe(404);
  });

  it("can be changed before the headers are sent", () => {
    const res = createResponse();
    res.statusCode = 200;
    res.statusCode = 404;
    expect(res.statusCode).toBe(404);
  });

  it("is kept once the headers have been sent", () => {
    const res = createResponse();
    res.writeHead(304, { etag: '"abc"' });
    res.end();

    // Next.js assigns the status code again after `sendEtagResponse` ended the response
    res.statusCode = undefined as unknown as number;
    expect(res.statusCode).toBe(304);

    res.statusCode = 200;
    expect(res.statusCode).toBe(304);
  });
});
