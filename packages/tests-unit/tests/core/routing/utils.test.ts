import {
  convertToQuery,
  convertToQueryString,
} from "@opennextjs/aws/core/routing/util.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({}));

describe("convertToQueryString", () => {
  it("returns an empty string for no queries", () => {
    const query = {};
    expect(convertToQueryString(query)).toBe("");
  });

  it("converts a single entry to one querystring parameter", () => {
    const query = { key: "value" };
    expect(convertToQueryString(query)).toBe("?key=value");
  });

  it("converts multiple distinct entries to a querystring parameter each", () => {
    const query = { key: "value", another: "value2" };
    expect(convertToQueryString(query)).toBe("?key=value&another=value2");
  });

  it("converts multi-value parameters to multiple key value pairs", () => {
    const query = { key: ["value1", "value2"] };
    expect(convertToQueryString(query)).toBe("?key=value1&key=value2");
  });

  it("converts mixed multi-value and single value parameters", () => {
    const query = { key: ["value1", "value2"], another: "value3" };
    expect(convertToQueryString(query)).toBe(
      "?key=value1&key=value2&another=value3",
    );
  });
});

describe("convertToQuery", () => {
  it("returns an empty object for empty string", () => {
    const querystring = "";
    expect(convertToQuery(querystring)).toEqual({});
  });

  it("converts a single querystring parameter to one query entry", () => {
    const querystring = "key=value";
    expect(convertToQuery(querystring)).toEqual({ key: "value" });
  });

  it("converts multiple distinct entries to an entry in the query", () => {
    const querystring = "key=value&another=value2";
    expect(convertToQuery(querystring)).toEqual({
      key: "value",
      another: "value2",
    });
  });

  it("converts multi-value parameters to an array in the query", () => {
    const querystring = "key=value1&key=value2";
    expect(convertToQuery(querystring)).toEqual({
      key: ["value1", "value2"],
    });
  });

  it("converts mixed multi-value and single value parameters", () => {
    const querystring = "key=value1&key=value2&another=value3";
    expect(convertToQuery(querystring)).toEqual({
      key: ["value1", "value2"],
      another: "value3",
    });
  });
});
