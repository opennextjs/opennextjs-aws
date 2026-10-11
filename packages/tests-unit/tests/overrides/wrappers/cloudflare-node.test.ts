import converter from "@opennextjs/aws/overrides/converters/edge.js";
import cloudflareNode from "@opennextjs/aws/overrides/wrappers/cloudflare-node.js";
import {
  ENCODE_BODY_HEADER,
  ENCODE_BODY_PATCH_KEY,
  type ResponseInitWithEncodeBody,
} from "@opennextjs/aws/utils/encoding.js";
import type {
  InternalEvent,
  InternalResult,
  StreamCreator,
} from "types/open-next";
import type { OpenNextHandler } from "types/overrides";

// Importing the wrapper installs the patch
const PatchedResponse = globalThis.Response;

let responseInits: (ResponseInitWithEncodeBody | undefined)[];

class SpyResponse extends PatchedResponse {
  constructor(body?: BodyInit | null, init?: ResponseInitWithEncodeBody) {
    super(body, init);
    responseInits.push(init);
  }
}

beforeEach(() => {
  responseInits = [];
  vi.stubGlobal("Response", SpyResponse);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  globalThis.Response = Reflect.get(globalThis, ENCODE_BODY_PATCH_KEY);
  Reflect.deleteProperty(globalThis, ENCODE_BODY_PATCH_KEY);
});

const BODY = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0xff]);

/**
 * Creates the Response returned by the app and returns its headers as Next.js pipes them.
 */
function appResponseHeaders(
  init: ResponseInitWithEncodeBody,
): Record<string, string> {
  const response = new PatchedResponse(BODY, init);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

async function invoke({
  url = "https://example.com/",
  statusCode = 200,
  headers = {},
}: {
  url?: string;
  statusCode?: number;
  headers?: Record<string, string>;
}) {
  const handler: OpenNextHandler<InternalEvent, InternalResult> = async (
    _event,
    options,
  ) => {
    const streamCreator = options?.streamCreator as StreamCreator;
    const writable = streamCreator.writeHeaders({
      statusCode,
      cookies: [],
      headers,
    });
    writable.write(BODY);
    writable.end();
    return {
      type: "core",
      statusCode,
      headers,
      body: new ReadableStream(),
      isBase64Encoded: false,
    };
  };
  const promises: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => {
      promises.push(p);
    },
  };
  const fetchHandler = await cloudflareNode.wrapper(handler, converter);
  const response: Response = await fetchHandler(
    new Request(url),
    {},
    ctx,
    new AbortController().signal,
  );
  await Promise.all(promises);
  expect(responseInits).toHaveLength(1);
  return { response, init: responseInits[0] };
}

describe("cloudflare-node wrapper", () => {
  it("installs the Response patch", () => {
    expect(Reflect.has(globalThis, ENCODE_BODY_PATCH_KEY)).toBe(true);
  });

  it("does not set encodeBody when the response has no content-encoding", async () => {
    const { response, init } = await invoke({});
    expect(init?.encodeBody).toBeUndefined();
    expect(response.headers.has("content-encoding")).toBe(false);
  });

  it.each(["gzip", "br"])(
    "sets encodeBody to manual for a tagged %s response and strips the tag",
    async (encoding) => {
      const headers = appResponseHeaders({
        headers: { "content-encoding": encoding },
        encodeBody: "manual",
      });
      expect(headers[ENCODE_BODY_HEADER]).toBe("manual");

      const { response, init } = await invoke({ headers });
      expect(init?.encodeBody).toBe("manual");
      expect(response.headers.get("content-encoding")).toBe(encoding);
      expect(response.headers.has(ENCODE_BODY_HEADER)).toBe(false);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(BODY);
    },
  );

  it("does not set encodeBody for an untagged gzip response (fetch passthrough)", async () => {
    const { response, init } = await invoke({
      headers: { "content-encoding": "gzip", "x-custom": "value" },
    });
    expect(init).toEqual({ status: 200, headers: expect.any(Headers) });
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("x-custom")).toBe("value");
  });

  it("sets content-encoding to identity on localhost without the tag", async () => {
    const { response, init } = await invoke({
      url: "http://localhost:8787/",
      headers: { "content-encoding": "gzip" },
    });
    expect(response.headers.get("content-encoding")).toBe("identity");
    expect(init?.encodeBody).toBeUndefined();
  });

  it("preserves content-encoding on localhost with the tag", async () => {
    const { response, init } = await invoke({
      url: "http://localhost:8787/",
      headers: appResponseHeaders({
        headers: { "content-encoding": "gzip" },
        encodeBody: "manual",
      }),
    });
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.has(ENCODE_BODY_HEADER)).toBe(false);
    expect(init?.encodeBody).toBe("manual");
  });

  it("strips the tag for null body statuses", async () => {
    const { response, init } = await invoke({
      statusCode: 204,
      headers: appResponseHeaders({
        headers: { "content-encoding": "gzip" },
        encodeBody: "manual",
      }),
    });
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(response.headers.has(ENCODE_BODY_HEADER)).toBe(false);
    expect(init?.encodeBody).toBe("manual");
  });
});
