import {
  getQueryFromSearchParams,
  removeUndefinedFromQuery,
} from "@opennextjs/aws/overrides/converters/utils.js";

describe("removeUndefinedFromQuery", () => {
  it("should remove undefined from query", () => {
    const result = removeUndefinedFromQuery({
      a: "1",
      b: ["2", "3"],
      c: undefined,
    });

    expect(result).toEqual({
      a: "1",
      b: ["2", "3"],
    });
  });

  it("should return empty object if input is empty", () => {
    const result = removeUndefinedFromQuery({});

    expect(result).toEqual({});
  });

  it("should return empty object if all values are undefined", () => {
    const result = removeUndefinedFromQuery({
      a: undefined,
      b: undefined,
    });

    expect(result).toEqual({});
  });
});

describe("getQueryFromSearchParams", () => {
  it("returns an empty object when there are no params", () => {
    expect(getQueryFromSearchParams(new URLSearchParams(""))).toEqual({});
  });

  it("returns a single param", () => {
    expect(getQueryFromSearchParams(new URLSearchParams("key=value"))).toEqual({
      key: "value",
    });
  });

  it("groups repeated keys into an array", () => {
    expect(
      getQueryFromSearchParams(new URLSearchParams("key=value1&key=value2")),
    ).toEqual({
      key: ["value1", "value2"],
    });
  });

  // https://github.com/opennextjs/opennextjs-cloudflare/issues/1134
  it("keeps reserved characters percent-encoded so the value survives convertToQueryString", () => {
    const raw =
      "authorizationURL=https%3A%2F%2Fexample.com%2Fauth%3Fresponse_type%3Dcode%2Bid_token%26state%3Dabc&oauthState=xyz";
    const query = getQueryFromSearchParams(new URLSearchParams(raw));

    // The encoded value must be preserved (not decoded), otherwise the nested
    // "&"/"="/"+"/space would break the rebuilt query string.
    expect(query).toEqual({
      authorizationURL:
        "https%3A%2F%2Fexample.com%2Fauth%3Fresponse_type%3Dcode%2Bid_token%26state%3Dabc",
      oauthState: "xyz",
    });

    // The value round-trips back to the original once decoded.
    expect(decodeURIComponent(query.authorizationURL as string)).toBe(
      "https://example.com/auth?response_type=code+id_token&state=abc",
    );
  });
});
