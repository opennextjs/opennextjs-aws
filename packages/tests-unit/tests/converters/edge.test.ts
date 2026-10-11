import converter from "@opennextjs/aws/overrides/converters/edge.js";
import {
  ENCODE_BODY_HEADER,
  type ResponseInitWithEncodeBody,
} from "@opennextjs/aws/utils/encoding.js";

const OriginalResponse = globalThis.Response;
let responseInits: (ResponseInitWithEncodeBody | undefined)[];

class SpyResponse extends OriginalResponse {
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

const BODY = new Uint8Array([1, 2, 3]);

function bodyStream() {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(BODY);
      controller.close();
    },
  });
}

describe("convertTo", () => {
  it("sets encodeBody to manual for a tagged response and strips the tag", async () => {
    const response = (await converter.convertTo({
      type: "core",
      statusCode: 200,
      headers: { "content-encoding": "gzip", [ENCODE_BODY_HEADER]: "manual" },
      body: bodyStream(),
      isBase64Encoded: false,
    })) as Response;

    expect(responseInits[0]?.encodeBody).toBe("manual");
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.has(ENCODE_BODY_HEADER)).toBe(false);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BODY);
  });

  it("does not set encodeBody for an untagged gzip response", async () => {
    const response = (await converter.convertTo({
      type: "core",
      statusCode: 200,
      headers: { "content-encoding": "gzip" },
      body: bodyStream(),
      isBase64Encoded: false,
    })) as Response;

    expect(responseInits[0]?.encodeBody).toBeUndefined();
    expect(response.headers.get("content-encoding")).toBe("gzip");
  });

  it("strips the tag for null body statuses", async () => {
    const response = (await converter.convertTo({
      type: "core",
      statusCode: 204,
      headers: { "content-encoding": "gzip", [ENCODE_BODY_HEADER]: "manual" },
      body: bodyStream(),
      isBase64Encoded: false,
    })) as Response;

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(response.headers.has(ENCODE_BODY_HEADER)).toBe(false);
    expect(responseInits[0]?.encodeBody).toBe("manual");
  });

  it("strips the tag for redirects", async () => {
    const response = (await converter.convertTo({
      type: "core",
      statusCode: 307,
      headers: { location: "/target", [ENCODE_BODY_HEADER]: "manual" },
      body: bodyStream(),
      isBase64Encoded: false,
    })) as Response;

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/target");
    expect(response.headers.has(ENCODE_BODY_HEADER)).toBe(false);
  });
});
