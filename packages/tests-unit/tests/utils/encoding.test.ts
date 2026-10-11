import {
  ENCODE_BODY_HEADER,
  ENCODE_BODY_PATCH_KEY,
  type ResponseInitWithEncodeBody,
  createResponse,
  installResponsePatch,
  takeEncodeBodyTag,
} from "@opennextjs/aws/utils/encoding.js";

const OriginalResponse = globalThis.Response;

function restoreResponse() {
  globalThis.Response = OriginalResponse;
  Reflect.deleteProperty(globalThis, ENCODE_BODY_PATCH_KEY);
}

describe("installResponsePatch", () => {
  beforeEach(() => {
    restoreResponse();
    installResponsePatch();
  });

  afterAll(() => {
    restoreResponse();
  });

  it("is installed only once", () => {
    const PatchedResponse = globalThis.Response;
    expect(PatchedResponse).not.toBe(OriginalResponse);
    expect(Reflect.get(globalThis, ENCODE_BODY_PATCH_KEY)).toBe(
      OriginalResponse,
    );

    installResponsePatch();

    expect(globalThis.Response).toBe(PatchedResponse);
  });

  it("keeps the Response class name", () => {
    expect(globalThis.Response).not.toBe(OriginalResponse);
    expect(globalThis.Response.name).toBe("Response");
  });

  it("tags a Response created with encodeBody manual", () => {
    const init: ResponseInitWithEncodeBody = {
      headers: { "content-encoding": "gzip" },
      encodeBody: "manual",
    };
    const response = new Response("body", init);
    expect(response.headers.get(ENCODE_BODY_HEADER)).toBe("manual");
    expect(response.headers.get("content-encoding")).toBe("gzip");
  });

  it.each([
    undefined,
    { headers: { "content-encoding": "gzip" } },
    { encodeBody: "automatic" } satisfies ResponseInitWithEncodeBody,
  ])("does not tag a Response created with %j", (init) => {
    const response = new Response("body", init);
    expect(response.headers.has(ENCODE_BODY_HEADER)).toBe(false);
  });

  it("tags a subclass evaluated after the patch", () => {
    class SubResponse extends Response {}
    const init: ResponseInitWithEncodeBody = { encodeBody: "manual" };
    const response = new SubResponse("body", init);
    expect(response.headers.get(ENCODE_BODY_HEADER)).toBe("manual");
    expect(response).toBeInstanceOf(SubResponse);
    expect(response).toBeInstanceOf(Response);
    expect(new Response("body")).not.toBeInstanceOf(SubResponse);
    expect(new OriginalResponse("body")).not.toBeInstanceOf(SubResponse);
  });

  it("keeps instanceof Response working", () => {
    expect(new Response("body")).toBeInstanceOf(Response);
    expect(new Response("body")).toBeInstanceOf(OriginalResponse);
    expect(new OriginalResponse("body")).toBeInstanceOf(Response);
    expect(Response.json({ a: 1 })).toBeInstanceOf(Response);
    expect(Response.redirect("https://example.com/", 307)).toBeInstanceOf(
      Response,
    );
    expect({}).not.toBeInstanceOf(Response);
    expect(null).not.toBeInstanceOf(Response);
  });

  it("keeps the inherited statics working", async () => {
    const json = Response.json({ a: 1 }, { status: 201 });
    expect(json.status).toBe(201);
    expect(await json.json()).toEqual({ a: 1 });

    const redirect = Response.redirect("https://example.com/", 307);
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get("location")).toBe("https://example.com/");
  });
});

describe("takeEncodeBodyTag", () => {
  it("removes the tag and returns true when it is set to manual", () => {
    const headers = new Headers({
      [ENCODE_BODY_HEADER]: "manual",
      "content-encoding": "gzip",
    });
    expect(takeEncodeBodyTag(headers)).toBe(true);
    expect(headers.has(ENCODE_BODY_HEADER)).toBe(false);
    expect(headers.get("content-encoding")).toBe("gzip");
  });

  it("returns true for joined values", () => {
    const headers = new Headers();
    headers.append(ENCODE_BODY_HEADER, "manual");
    headers.append(ENCODE_BODY_HEADER, "manual");
    expect(headers.get(ENCODE_BODY_HEADER)).toBe("manual, manual");
    expect(takeEncodeBodyTag(headers)).toBe(true);
    expect(headers.has(ENCODE_BODY_HEADER)).toBe(false);
  });

  it("returns false when the tag is not set", () => {
    const headers = new Headers({ "content-encoding": "gzip" });
    expect(takeEncodeBodyTag(headers)).toBe(false);
    expect(headers.get("content-encoding")).toBe("gzip");
  });

  it("removes an unexpected tag value and returns false", () => {
    const headers = new Headers({ [ENCODE_BODY_HEADER]: "automatic" });
    expect(takeEncodeBodyTag(headers)).toBe(false);
    expect(headers.has(ENCODE_BODY_HEADER)).toBe(false);
  });
});

describe("createResponse", () => {
  afterEach(() => {
    restoreResponse();
  });

  it("does not leak the tag added by the patched Response", () => {
    installResponsePatch();
    const response = createResponse(
      "body",
      200,
      new Headers({ "content-encoding": "gzip" }),
      true,
    );
    expect(response.status).toBe(200);
    expect(response.headers.has(ENCODE_BODY_HEADER)).toBe(false);
    expect(response.headers.get("content-encoding")).toBe("gzip");
  });
});
