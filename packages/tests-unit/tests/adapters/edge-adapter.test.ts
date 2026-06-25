// edge-adapter imports globalThis.isEdgeRuntime and createGenericHandler which
// require heavy bundled context. Unit-test the header harvest logic directly.

function harvestHeaders(
  headers: Pick<Headers, "forEach" | "getSetCookie">,
): Record<string, string | string[]> {
  const responseHeaders: Record<string, string | string[]> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    responseHeaders[key] = value;
  });
  const setCookies = headers.getSetCookie();
  if (setCookies.length > 0) {
    responseHeaders["set-cookie"] = setCookies;
  }
  return responseHeaders;
}

// Simulates Headers.forEach folding same-name headers (WHATWG-compliant behavior
// on runtimes where this occurs), while getSetCookie() still returns them split.
function makeFoldingHeaders(
  cookies: string[],
  extra: Record<string, string> = {},
): Pick<Headers, "forEach" | "getSetCookie"> {
  return {
    forEach(fn: (value: string, key: string) => void) {
      if (cookies.length > 0) fn(cookies.join(", "), "set-cookie");
      for (const [k, v] of Object.entries(extra)) fn(v, k);
    },
    getSetCookie() {
      return [...cookies];
    },
  } as unknown as Pick<Headers, "forEach" | "getSetCookie">;
}

describe("edge-adapter header harvest", () => {
  it("emits a single set-cookie as a one-element array", () => {
    const headers = makeFoldingHeaders(["session=abc; Path=/; HttpOnly"]);
    const out = harvestHeaders(headers);
    expect(out["set-cookie"]).toEqual(["session=abc; Path=/; HttpOnly"]);
  });

  it("preserves multiple set-cookie headers when forEach folds them", () => {
    const cookies = [
      "appSession.0=AAA; HttpOnly; SameSite=Lax; Path=/",
      "appSession.1=BBB; HttpOnly; SameSite=Lax; Path=/",
      "appSession.2=CCC; HttpOnly; SameSite=Lax; Path=/",
    ];
    const out = harvestHeaders(makeFoldingHeaders(cookies, { "x-custom": "value" }));
    expect(out["set-cookie"]).toEqual(cookies);
  });

  it("each set-cookie entry is discrete, not comma-joined", () => {
    const cookies = [
      "appSession.0=AAA; HttpOnly; Path=/",
      "appSession.1=BBB; HttpOnly; Path=/",
    ];
    const out = harvestHeaders(makeFoldingHeaders(cookies));
    for (const entry of out["set-cookie"] as string[]) {
      expect(entry).not.toContain(", appSession");
    }
  });

  it("passes non-set-cookie headers through unchanged", () => {
    const out = harvestHeaders(
      makeFoldingHeaders(["tok=x; Path=/"], {
        "content-type": "application/json",
        "x-request-id": "abc-123",
      }),
    );
    expect(out["content-type"]).toBe("application/json");
    expect(out["x-request-id"]).toBe("abc-123");
  });

  it("omits set-cookie key when there are no cookies", () => {
    const out = harvestHeaders(makeFoldingHeaders([], { "x-foo": "bar" }));
    expect("set-cookie" in out).toBe(false);
    expect(out["x-foo"]).toBe("bar");
  });
});
