import { request } from "node:https";
import nodeProxy from "@opennextjs/aws/overrides/proxyExternalRequest/node.js";
import { beforeEach, vi } from "vitest";

vi.mock("node:https", () => ({
  request: vi.fn(() => ({ write: vi.fn(), end: vi.fn() })),
}));

describe("proxyExternalRequest/node", () => {
  beforeEach(() => {
    vi.mocked(request).mockClear();
  });

  it("the proxy should not relay the x-forwarded-host sent by the client", () => {
    nodeProxy.proxy({
      url: "https://upstream.example/path",
      method: "GET",
      headers: {
        host: "shop.example",
        "X-Forwarded-Host": "evil.example",
        "x-forwarded-host": "evil.example",
        accept: "text/html",
      },
    } as any);

    expect(vi.mocked(request)).toHaveBeenCalledOnce();
    const options = vi.mocked(request).mock.calls[0][1] as {
      headers: Record<string, string>;
    };
    expect(options.headers).toEqual({
      accept: "text/html",
      "x-forwarded-host": "shop.example",
    });
  });

  it("the proxy should drop the x-forwarded-host when there is no host", () => {
    nodeProxy.proxy({
      url: "https://upstream.example/path",
      method: "GET",
      headers: { "x-forwarded-host": "evil.example" },
    } as any);

    expect(vi.mocked(request)).toHaveBeenCalledOnce();
    const options = vi.mocked(request).mock.calls[0][1] as {
      headers: Record<string, string>;
    };
    expect(options.headers).toEqual({});
  });
});
