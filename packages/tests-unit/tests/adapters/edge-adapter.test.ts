// edge-adapter imports globalThis.isEdgeRuntime and createGenericHandler which
// require heavy bundled context. Unit-test the header harvest logic directly.
import { convertEdgeResponseHeaders as harvestHeaders } from "@opennextjs/aws/http/util.js";
import { NextResponse } from "next/server.js";

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
    const out = harvestHeaders(
      makeFoldingHeaders(cookies, { "x-custom": "value" }),
    );
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

  it("does not expose x-middleware-set-cookie from a route handler NextResponse", () => {
    const response = NextResponse.json({ token: "abc" });
    response.cookies.set("session", "secret", { httpOnly: true });
    // Sanity check: NextResponse copies the cookies in the internal header
    expect(response.headers.get("x-middleware-set-cookie")).toContain(
      "session=secret",
    );

    const out = harvestHeaders(response.headers);

    expect(out).not.toHaveProperty("x-middleware-set-cookie");
    expect(out["set-cookie"]).toEqual(["session=secret; Path=/; HttpOnly"]);
    expect(out["content-type"]).toBe("application/json");
  });

  it("omits set-cookie key when there are no cookies", () => {
    const out = harvestHeaders(makeFoldingHeaders([], { "x-foo": "bar" }));
    expect("set-cookie" in out).toBe(false);
    expect(out["x-foo"]).toBe("bar");
  });
});
