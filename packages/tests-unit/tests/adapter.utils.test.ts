import { convertToQueryString } from "../../open-next/src/adapters/routing/util";
import { parseCookies } from "../../open-next/src/adapters/util";

describe("adapter utils", () => {
  describe("parseCookies", () => {
    it("returns undefined if cookies is empty", () => {
      const cookies = parseCookies("");
      expect(cookies).toBeUndefined();
    });
    it("returns undefined if no cookies", () => {
      const cookies = parseCookies();
      expect(cookies).toBeUndefined();
    });
    it("parse single cookie", () => {
      const cookies = parseCookies(
        "cookie1=value1; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; Path=/",
      );
      expect(cookies).toEqual([
        "cookie1=value1; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; Path=/",
      ]);
    });
    it("parse multiple cookies", () => {
      // NOTE: expires is lower case but still works
      const cookies = parseCookies(
        "cookie1=value1; expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; Path=/, cookie2=value2; HttpOnly; Secure",
      );
      expect(cookies).toEqual([
        "cookie1=value1; expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; Path=/",
        "cookie2=value2; HttpOnly; Secure",
      ]);
    });
    it("return if cookies is already an array", () => {
      const cookies = parseCookies([
        "cookie1=value1; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; Path=/",
      ]);
      expect(cookies).toEqual([
        "cookie1=value1; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; Path=/",
      ]);
    });
    it("parses w/o Expire", () => {
      const cookies = parseCookies(
        "cookie1=value1; HttpOnly; Secure; Path=/, cookie2=value2; HttpOnly=false; Secure=True; Domain=example.com; Path=/api",
      );
      expect(cookies).toEqual([
        "cookie1=value1; HttpOnly; Secure; Path=/",
        "cookie2=value2; HttpOnly=false; Secure=True; Domain=example.com; Path=/api",
      ]);
    });
  });

  describe("convertToQueryString", () => {
    it("returns an empty string for no queries", () => {
      const query = {};
      expect(convertToQueryString(query)).toBe("");
    });

    it("converts a single entry to one querystring parameter", () => {
      const query = { key: "value" };
      expect(convertToQueryString(query)).toBe("key=value");
    });

    it("converts multiple distinct entries to a querystring parameter each", () => {
      const query = { key: "value", another: "value2" };
      expect(convertToQueryString(query)).toBe("key=value&another=value2");
    });

    it("converts multi-value parameters to multiple key value pairs", () => {
      const query = { key: ["value1", "value2"] };
      expect(convertToQueryString(query)).toBe("key=value1&key=value2");
    });

    it("converts mixed multi-value and single value parameters", () => {
      const query = { key: ["value1", "value2"], another: "value3" };
      expect(convertToQueryString(query)).toBe(
        "key=value1&key=value2&another=value3",
      );
    });
  });
});
