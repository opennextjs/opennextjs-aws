import { IncomingMessage } from "@opennextjs/aws/http/request.js";
import converter from "@opennextjs/aws/overrides/converters/node.js";

describe("convertFrom", () => {
  it("should convert GET request", async () => {
    const result = await converter.convertFrom(
      new IncomingMessage({
        url: "/",
        method: "GET",
        headers: {
          "content-length": "0",
        },
        remoteAddress: "::1",
      }),
    );

    expect(result).toEqual({
      type: "core",
      url: "http://on/",
      rawPath: "/",
      method: "GET",
      headers: {
        "content-length": "0",
      },
      remoteAddress: "::1",
      body: Buffer.from(""),
      cookies: {},
      query: {},
    });
  });

  it("should convert GET request with host header", async () => {
    const result = await converter.convertFrom(
      new IncomingMessage({
        url: "/path",
        method: "GET",
        headers: {
          "content-length": "0",
          host: "localhost",
        },
        remoteAddress: "127.0.0.1",
      }),
    );

    expect(result).toEqual({
      type: "core",
      url: "http://localhost/path",
      rawPath: "/path",
      method: "GET",
      headers: {
        "content-length": "0",
        host: "localhost",
      },
      remoteAddress: "127.0.0.1",
      body: Buffer.from(""),
      cookies: {},
      query: {},
    });
  });

  it("should convert GET request with default remoteAddress", async () => {
    const result = await converter.convertFrom(
      new IncomingMessage({
        url: "/path",
        method: "GET",
        headers: {
          "content-length": "0",
        },
      }),
    );

    expect(result).toEqual({
      type: "core",
      url: "http://on/path",
      rawPath: "/path",
      method: "GET",
      headers: {
        "content-length": "0",
      },
      remoteAddress: "::1",
      body: Buffer.from(""),
      cookies: {},
      query: {},
    });
  });

  it("should convert GET request with remoteAddress from x-forwarded-for header", async () => {
    const result = await converter.convertFrom(
      new IncomingMessage({
        url: "/path",
        method: "GET",
        headers: {
          "content-length": "0",
          "x-forwarded-for": "127.0.0.2",
        },
        remoteAddress: "127.0.0.1",
      }),
    );

    expect(result).toEqual({
      type: "core",
      url: "http://on/path",
      rawPath: "/path",
      method: "GET",
      headers: {
        "content-length": "0",
        "x-forwarded-for": "127.0.0.2",
      },
      remoteAddress: "127.0.0.2",
      body: Buffer.from(""),
      cookies: {},
      query: {},
    });
  });

  it("should convert GET request with query string", async () => {
    const result = await converter.convertFrom(
      new IncomingMessage({
        url: "/path?search=1",
        method: "GET",
        headers: {
          "content-length": "0",
          host: "localhost",
        },
        remoteAddress: "::1",
      }),
    );

    expect(result).toEqual({
      type: "core",
      url: "http://localhost/path?search=1",
      rawPath: "/path",
      method: "GET",
      headers: {
        "content-length": "0",
        host: "localhost",
      },
      remoteAddress: "::1",
      body: Buffer.from(""),
      cookies: {},
      query: {
        search: "1",
      },
    });
  });

  it("should convert POST request with single cookie", async () => {
    const result = await converter.convertFrom(
      new IncomingMessage({
        url: "/path",
        method: "POST",
        headers: {
          "content-length": "2",
          "content-type": "application/json",
          cookie: "foo=bar",
        },
        remoteAddress: "::1",
        body: Buffer.from("{}"),
      }),
    );

    expect(result).toEqual({
      type: "core",
      url: "http://on/path",
      rawPath: "/path",
      method: "POST",
      headers: {
        "content-length": "2",
        "content-type": "application/json",
        cookie: "foo=bar",
      },
      remoteAddress: "::1",
      body: Buffer.from("{}"),
      cookies: {
        foo: "bar",
      },
      query: {},
    });
  });

  it("should convert PUT request with multiple cookie headers", async () => {
    const result = await converter.convertFrom(
      new IncomingMessage({
        url: "/path",
        method: "PUT",
        headers: {
          "content-length": "2",
          "content-type": "application/json",
          cookie: "foo=bar; hello=world",
        },
        remoteAddress: "::1",
        body: Buffer.from("{}"),
      }),
    );

    expect(result).toEqual({
      type: "core",
      url: "http://on/path",
      rawPath: "/path",
      method: "PUT",
      headers: {
        "content-length": "2",
        "content-type": "application/json",
        cookie: "foo=bar; hello=world",
      },
      remoteAddress: "::1",
      body: Buffer.from("{}"),
      cookies: {
        foo: "bar",
        hello: "world",
      },
      query: {},
    });
  });
});
