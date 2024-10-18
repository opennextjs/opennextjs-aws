import converter from "@opennextjs/aws/overrides/converters/aws-cloudfront.js";
import { CloudFrontRequestEvent, CloudFrontRequestResult } from "aws-lambda";
import { Readable } from "stream";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({}));

describe("convertTo", () => {
  it("Should parse the headers", async () => {
    const response = (await converter.convertTo({
      body: Readable.toWeb(Readable.from(Buffer.from(""))),
      headers: {
        "content-type": "application/json",
        test: "test",
      },
      isBase64Encoded: false,
      statusCode: 200,
      type: "cf",
    })) as CloudFrontRequestResult;

    expect(response?.headers).toStrictEqual({
      "content-type": [
        {
          key: "content-type",
          value: "application/json",
        },
      ],
      test: [
        {
          key: "test",
          value: "test",
        },
      ],
    });
  });

  it("Should parse the headers with arrays", async () => {
    const response = (await converter.convertTo({
      body: Readable.toWeb(Readable.from(Buffer.from(""))),
      headers: {
        test: ["test1", "test2"],
      },
      isBase64Encoded: false,
      statusCode: 200,
      type: "cf",
    })) as CloudFrontRequestResult;

    expect(response?.headers).toStrictEqual({
      test: [
        {
          key: "test",
          value: "test1",
        },
        {
          key: "test",
          value: "test2",
        },
      ],
    });
  });

  it("Should parse the headers with cookies", async () => {
    const response = (await converter.convertTo({
      body: Readable.toWeb(Readable.from(Buffer.from(""))),
      headers: {
        "set-cookie":
          "test=1; Path=/; HttpOnly; Secure; SameSite=None, test=2; Path=/; HttpOnly; Secure; SameSite=None",
      },
      isBase64Encoded: false,
      statusCode: 200,
      type: "cf",
    })) as CloudFrontRequestResult;

    expect(response?.headers).toStrictEqual({
      "set-cookie": [
        {
          key: "set-cookie",
          value: "test=1; Path=/; HttpOnly; Secure; SameSite=None",
        },
        {
          key: "set-cookie",
          value: "test=2; Path=/; HttpOnly; Secure; SameSite=None",
        },
      ],
    });
  });

  it("Should parse the headers with cookies + expires", async () => {
    const response = (await converter.convertTo({
      body: Readable.toWeb(Readable.from(Buffer.from(""))),
      headers: {
        "set-cookie":
          "test=1; Path=/; Expires=Sun, 14 Apr 2024 22:19:07 GMT; HttpOnly; Secure; SameSite=None, test=2; Path=/; Expires=Sun, 14 Apr 2024 22:19:07 GMT; HttpOnly; Secure; SameSite=None",
      },
      isBase64Encoded: false,
      statusCode: 200,
      type: "cf",
    })) as CloudFrontRequestResult;

    expect(response?.headers).toStrictEqual({
      "set-cookie": [
        {
          key: "set-cookie",
          value:
            "test=1; Path=/; Expires=Sun, 14 Apr 2024 22:19:07 GMT; HttpOnly; Secure; SameSite=None",
        },
        {
          key: "set-cookie",
          value:
            "test=2; Path=/; Expires=Sun, 14 Apr 2024 22:19:07 GMT; HttpOnly; Secure; SameSite=None",
        },
      ],
    });
  });

  describe("blacklisted headers", () => {
    it("should remove all blacklisted or read-only headers from the response", async () => {
      const response = (await converter.convertTo({
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
      })) as CloudFrontRequestResult;

      expect(response?.headers).toStrictEqual({
        "x-powered-by": [
          {
            key: "x-powered-by",
            value: "Next.js",
          },
        ],
      });
    });
  });
});

describe("convertFrom", () => {
  type CloudFrontRequest =
    CloudFrontRequestEvent["Records"][number]["cf"]["request"];
  type CloudFrontConfig =
    CloudFrontRequestEvent["Records"][number]["cf"]["config"];

  function createEvent(
    request: CloudFrontRequest,
    config: CloudFrontConfig = {
      distributionDomainName: "d123.cloudfront.net",
      distributionId: "EDFDVBD6EXAMPLE",
      eventType: "origin-request",
      requestId: "EXAMPLE",
    },
  ): CloudFrontRequestEvent {
    return {
      Records: [
        {
          cf: {
            request,
            config,
          },
        },
      ],
    };
  }

  it("Should parse the headers", async () => {
    const event = createEvent({
      clientIp: "::1",
      headers: {
        "content-type": [
          {
            key: "content-type",
            value: "application/json",
          },
        ],
      },
      method: "POST",
      querystring: "",
      uri: "/",
      body: {
        action: "read-only",
        data: JSON.stringify({ message: "Hello, world!" }),
        encoding: "text",
        inputTruncated: false,
      },
      origin: {} as any,
    });

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
      remoteAddress: "::1",
      query: {},
      cookies: {},
    });
  });

  it("Should parse query string", async () => {
    const event = createEvent({
      clientIp: "::1",
      headers: {
        "content-type": [
          {
            key: "content-type",
            value: "application/json",
          },
        ],
      },
      method: "POST",
      querystring: "hello=world&foo=1&foo=2",
      uri: "/",
      body: {
        action: "read-only",
        data: JSON.stringify({ message: "Hello, world!" }),
        encoding: "text",
        inputTruncated: false,
      },
      origin: {} as any,
    });

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
      remoteAddress: "::1",
      query: {
        hello: "world",
        foo: ["1", "2"],
      },
      cookies: {},
    });
  });

  it("Should parse base64 encoded body", async () => {
    const event = createEvent({
      clientIp: "::1",
      headers: {
        "content-type": [
          {
            key: "content-type",
            value: "application/json",
          },
        ],
      },
      method: "POST",
      querystring: "",
      uri: "/",
      body: {
        action: "read-only",
        data: Buffer.from(
          JSON.stringify({ message: "Hello, world!" }),
        ).toString("base64"),
        encoding: "base64",
        inputTruncated: false,
      },
      origin: {} as any,
    });

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
      remoteAddress: "::1",
      query: {},
      cookies: {},
    });
  });
});
