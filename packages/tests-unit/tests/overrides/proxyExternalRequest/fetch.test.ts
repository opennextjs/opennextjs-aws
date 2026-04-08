import fetchProxy from "@opennextjs/aws/overrides/proxyExternalRequest/fetch.js";
import { afterEach, beforeEach, vi } from "vitest";

describe("proxyExternalRequest/fetch", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  // Note: if the url is hosted on the Cloudflare network we want to make sure that a `cf-connecting-ip` header is not being sent as that causes a DNS error
  //       (see: https://developers.cloudflare.com/support/troubleshooting/cloudflare-errors/troubleshooting-cloudflare-1xxx-errors/#error-1000-dns-points-to-prohibited-ip)
  it("the proxy should remove any cf-connecting-ip headers (with any casing) before passing it to fetch", async () => {
    const fetchMock = vi.fn<typeof global.fetch>(async () => new Response());
    globalThis.fetch = fetchMock;

    const { proxy } = fetchProxy;

    await proxy({
      headers: {
        "header-1": "valid header 1",
        "header-2": "valid header 2",
        "cf-connecting-ip": "forbidden header 1",
        "header-3": "valid header 3",
        "CF-Connecting-IP": "forbidden header 2",
        "CF-CONNECTING-IP": "forbidden header 3",
        "header-4": "valid header 4",
      },
    });

    expect(fetchMock.mock.calls.length).toEqual(1);

    const headersPassedToFetch = Object.keys(
      fetchMock.mock.calls[0][1]?.headers ?? {},
    );

    expect(headersPassedToFetch).toContain("header-1");
    expect(headersPassedToFetch).toContain("header-2");
    expect(headersPassedToFetch).not.toContain("cf-connecting-ip");
    expect(headersPassedToFetch).toContain("header-3");
    expect(headersPassedToFetch).not.toContain("CF-Connecting-IP");
    expect(headersPassedToFetch).not.toContain("CF-CONNECTING-IP");
    expect(headersPassedToFetch).toContain("header-4");
  });
  it("the proxy should save multiple set-cookie response headers as an array", async () => {
    const responseHeaders = new Headers();
    responseHeaders.append("set-cookie", "foo=value1");
    responseHeaders.append("set-cookie", "bar=value2");
    responseHeaders.append("Set-Cookie", "cookie=value3");
    const fetchMock = vi.fn<typeof global.fetch>(
      async () =>
        new Response(null, {
          headers: responseHeaders,
        }),
    );
    globalThis.fetch = fetchMock;

    const { proxy } = fetchProxy;

    const { headers } = await proxy({ headers: {} });

    expect(fetchMock.mock.calls.length).toEqual(1);
    expect(headers["set-cookie"]).toEqual([
      "foo=value1",
      "bar=value2",
      "cookie=value3",
    ]);
  });
});
