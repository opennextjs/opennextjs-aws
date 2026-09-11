import converter from "@opennextjs/aws/overrides/converters/edge.js";

function middlewarePassThrough(headers: Record<string, string>) {
  return {
    type: "middleware" as const,
    internalEvent: {
      type: "core" as const,
      method: "GET",
      rawPath: "/",
      url: "https://bar.example/",
      headers,
      query: {},
      cookies: {},
      remoteAddress: "::1",
    },
    isExternalRewrite: false,
    origin: false,
    isISR: false,
    initialURL: "https://bar.example/",
    resolvedRoutes: [],
  };
}

describe("edge converter convertTo", () => {
  beforeEach(() => {
    globalThis.__dangerous_ON_edge_converter_returns_request = true;
  });

  afterEach(() => {
    globalThis.__dangerous_ON_edge_converter_returns_request = undefined;
  });

  it("preserves an existing x-forwarded-host instead of overwriting it with host", async () => {
    const request = (await converter.convertTo(
      middlewarePassThrough({
        host: "bar",
        "x-forwarded-host": "foo",
      }),
    )) as Request;

    expect(request.headers.get("x-forwarded-host")).toBe("foo");
  });

  it("sets x-forwarded-host from host when it is not already present", async () => {
    const request = (await converter.convertTo(
      middlewarePassThrough({
        host: "bar",
      }),
    )) as Request;

    expect(request.headers.get("x-forwarded-host")).toBe("bar");
  });
});
