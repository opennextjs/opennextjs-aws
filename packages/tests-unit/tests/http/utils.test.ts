import { parseSetCookieHeader } from "@opennextjs/aws/http/util.js";

describe("parseSetCookieHeader", () => {
  it("returns an empty list if cookies is emptyish", () => {
    expect(parseSetCookieHeader("")).toEqual([]);
    expect(parseSetCookieHeader(null)).toEqual([]);
    expect(parseSetCookieHeader(undefined)).toEqual([]);
    expect(parseSetCookieHeader([])).toEqual([]);
  });
  it("parse single cookie", () => {
    const cookies = parseSetCookieHeader(
      "cookie1=value1; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; Path=/",
    );
    expect(cookies).toEqual([
      "cookie1=value1; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; Path=/",
    ]);
  });
  it("parse multiple cookies", () => {
    // NOTE: expires is lower case but still works
    const cookies = parseSetCookieHeader(
      "cookie1=value1; expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; Path=/, cookie2=value2; HttpOnly; Secure",
    );
    expect(cookies).toEqual([
      "cookie1=value1; expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; Path=/",
      "cookie2=value2; HttpOnly; Secure",
    ]);
  });
  it("return if cookies is already an array", () => {
    const cookies = parseSetCookieHeader([
      "cookie1=value1; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; Path=/",
    ]);
    expect(cookies).toEqual([
      "cookie1=value1; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; Path=/",
    ]);
  });
  it("parses w/o Expire", () => {
    const cookies = parseSetCookieHeader(
      "cookie1=value1; HttpOnly; Secure; Path=/, cookie2=value2; HttpOnly=false; Secure=True; Domain=example.com; Path=/api",
    );
    expect(cookies).toEqual([
      "cookie1=value1; HttpOnly; Secure; Path=/",
      "cookie2=value2; HttpOnly=false; Secure=True; Domain=example.com; Path=/api",
    ]);
  });
});
