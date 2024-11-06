import { Readable } from "stream";
import converter from "@opennextjs/aws/overrides/converters/aws-apigw-v2.js";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({}));

describe("convertTo", () => {
  it("Should parse the headers", async () => {
    const response = await converter.convertTo({
      body: Readable.toWeb(Readable.from(Buffer.from(""))),
      headers: {
        "content-type": "application/json",
        test: "test",
      },
      isBase64Encoded: false,
      statusCode: 200,
    });

    expect(response.headers).toStrictEqual({
      "content-type": "application/json",
      test: "test",
    });
  });

  it("Should parse the headers with arrays", async () => {
    const response = await converter.convertTo({
      body: Readable.toWeb(Readable.from(Buffer.from(""))),
      headers: {
        test: ["test1", "test2"],
      },
      isBase64Encoded: false,
      statusCode: 200,
    });

    expect(response.headers).toStrictEqual({
      test: "test1, test2",
    });
  });

  describe("blacklisted headers", () => {
    it("should remove all blacklisted headers from the response", async () => {
      const response = await converter.convertTo({
        body: Readable.toWeb(Readable.from(Buffer.from(""))),
        headers: {
          Connection: "keep-alive",
          expect: "100-continue",
          "keep-Alive": "timeout=5, max=100",
          "Proxy-Authenticate": "Basic",
          "proxy-authorization": "Basic",
          "proxy-connection": "keep-alive",
          trailer: "Max-Forwards",
          Upgrade: "HTTP/2.0",
          "X-accel-buffering": "no",
          "X-accel-charset": "UTF-8",
          "x-accel-limit-rate": "1000",
          "X-accel-redirect": "http://example.com",
          "X-amz-cf-id": "example",
          "x-amzn-auth": "example",
          "x-Amzn-cf-billing": "example",
          "x-Amzn-cf-id": "example",
          "x-Amzn-Cf-xff": "example",
          "x-amzn-Errortype": "example",
          "x-amzn-fle-Profile": "example",
          "x-amzn-header-Count": "example",
          "x-amzn-Header-order": "example",
          "X-Amzn-Lambda-Integration-tag": "example",
          "x-amzn-Requestid": "example",
          "x-edge-Location": "example",
          "X-Cache": "Hit from cloudfront",
          "X-Forwarded-proto": "https",
          "x-Real-ip": "example",
          "Accept-encoding": "gzip",
          "content-length": "100",
          "if-modified-Since": "example",
          "if-none-match": "example",
          "if-range": "example",
          "if-unmodified-since": "example",
          "transfer-encoding": "example",
          via: "1.1 abc123.cloudfront.net (CloudFront)",
          "x-powered-by": "Next.js",
        },
        isBase64Encoded: false,
        statusCode: 200,
        type: "cf",
      });

      expect(response.headers).toStrictEqual({
        "accept-encoding": "gzip",
        "content-length": "100",
        "if-modified-since": "example",
        "if-none-match": "example",
        "if-range": "example",
        "if-unmodified-since": "example",
        "transfer-encoding": "example",
        "x-powered-by": "Next.js",
      });
    });
  });
});

describe("convertFrom", () => {
  it("Should parse the headers", async () => {
    const event: APIGatewayProxyEventV2 = {
      rawPath: "/",
      rawQueryString: "",
      cookies: undefined,
      headers: {
        "content-type": "application/json",
      },
      version: "2.0",
      routeKey: "",
      body: JSON.stringify({ message: "Hello, world!" }),
      isBase64Encoded: false,
      requestContext: {
        http: {
          method: "POST",
          sourceIp: "::1",
        },
      } as any,
    };

    const response = await converter.convertFrom(event);

    expect(response).toEqual({
      type: "core",
      method: "POST",
      rawPath: "/",
      url: "/",
      body: Buffer.from('{"message":"Hello, world!"}'),
      headers: {
        "content-type": "application/json",
      },
      cookies: {},
      query: {},
      remoteAddress: "::1",
    });
  });

  it("Should parse cookies", async () => {
    const event: APIGatewayProxyEventV2 = {
      rawPath: "/",
      rawQueryString: "",
      cookies: ["foo=bar", "hello=world"],
      headers: {
        "content-type": "application/json",
      },
      version: "2.0",
      routeKey: "",
      body: JSON.stringify({ message: "Hello, world!" }),
      isBase64Encoded: false,
      requestContext: {
        http: {
          method: "POST",
          sourceIp: "::1",
        },
      } as any,
    };

    const response = await converter.convertFrom(event);

    expect(response).toEqual({
      type: "core",
      method: "POST",
      rawPath: "/",
      url: "/",
      body: Buffer.from('{"message":"Hello, world!"}'),
      headers: {
        "content-type": "application/json",
        cookie: "foo=bar; hello=world",
      },
      cookies: {
        foo: "bar",
        hello: "world",
      },
      query: {},
      remoteAddress: "::1",
    });
  });

  it("Should parse query string", async () => {
    const event: APIGatewayProxyEventV2 = {
      rawPath: "/",
      rawQueryString: "hello=world&foo=1&foo=2",
      cookies: undefined,
      headers: {
        "content-type": "application/json",
      },
      version: "2.0",
      routeKey: "",
      body: JSON.stringify({ message: "Hello, world!" }),
      isBase64Encoded: false,
      requestContext: {
        http: {
          method: "POST",
          sourceIp: "::1",
        },
      } as any,
    };

    const response = await converter.convertFrom(event);

    expect(response).toEqual({
      type: "core",
      method: "POST",
      rawPath: "/",
      url: "/?hello=world&foo=1&foo=2",
      body: Buffer.from('{"message":"Hello, world!"}'),
      headers: {
        "content-type": "application/json",
      },
      cookies: {},
      query: {
        hello: "world",
        foo: ["1", "2"],
      },
      remoteAddress: "::1",
    });
  });

  it("Should handle base64 encoded body", async () => {
    const event: APIGatewayProxyEventV2 = {
      rawPath: "/",
      rawQueryString: "",
      cookies: undefined,
      headers: {
        "content-type": "application/json",
      },
      version: "2.0",
      routeKey: "",
      body: Buffer.from(JSON.stringify({ message: "Hello, world!" })).toString(
        "base64",
      ),
      isBase64Encoded: true,
      requestContext: {
        http: {
          method: "POST",
          sourceIp: "::1",
        },
      } as any,
    };

    const response = await converter.convertFrom(event);

    expect(response).toEqual({
      type: "core",
      method: "POST",
      rawPath: "/",
      url: "/",
      body: Buffer.from('{"message":"Hello, world!"}'),
      headers: {
        "content-type": "application/json",
      },
      cookies: {},
      query: {},
      remoteAddress: "::1",
    });
  });
});
