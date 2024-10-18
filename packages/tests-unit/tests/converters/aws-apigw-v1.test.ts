/* eslint-disable sonarjs/no-duplicate-string */
import converter from "@opennextjs/aws/overrides/converters/aws-apigw-v1.js";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Readable } from "stream";

describe("convertTo", () => {
  describe("AWS API Gateway v2 Result", () => {
    it("Should parse the headers", async () => {
      const response = (await converter.convertTo({
        body: Readable.toWeb(Readable.from(Buffer.from(""))),
        headers: {
          "content-type": "application/json",
          test: "test",
        },
        isBase64Encoded: false,
        statusCode: 200,
      })) as APIGatewayProxyResult;

      expect(response.headers).toStrictEqual({
        "content-type": "application/json",
        test: "test",
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
      })) as APIGatewayProxyResult;

      expect(response.multiValueHeaders).toStrictEqual({
        test: ["test1", "test2"],
      });
    });

    it("Should parse single and array headers", async () => {
      const response = (await converter.convertTo({
        body: Readable.toWeb(Readable.from(Buffer.from(""))),
        headers: {
          single: "test",
          multi: ["test1", "test2"],
        },
        isBase64Encoded: false,
        statusCode: 200,
      })) as APIGatewayProxyResult;

      expect(response.headers).toStrictEqual({
        single: "test",
      });
      expect(response.multiValueHeaders).toStrictEqual({
        multi: ["test1", "test2"],
      });
    });
  });
});

describe("convertFrom", () => {
  it("Should convert a simple APIGatewayProxyEvent", async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ message: "Hello, world!" }),
      headers: {
        "content-type": "application/json",
      },
      multiValueHeaders: {},
      httpMethod: "POST",
      isBase64Encoded: false,
      path: "/",
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        identity: {
          sourceIp: "::1",
        },
      } as any,
      resource: "",
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
      remoteAddress: "::1",
      query: {},
      cookies: {},
    });
  });

  it("Should handle multiValueHeaders", async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ message: "Hello, world!" }),
      headers: {},
      multiValueHeaders: {
        test: ["test1", "test2"],
      },
      httpMethod: "POST",
      isBase64Encoded: false,
      path: "/",
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        identity: {
          sourceIp: "::1",
        },
      } as any,
      resource: "",
    };

    const response = await converter.convertFrom(event);

    expect(response).toEqual({
      type: "core",
      method: "POST",
      rawPath: "/",
      url: "/",
      body: Buffer.from('{"message":"Hello, world!"}'),
      headers: {
        test: "test1,test2",
      },
      remoteAddress: "::1",
      query: {},
      cookies: {},
    });
  });

  it("Should handle queryStringParameters and multiValueQueryStringParameters", async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ message: "Hello, world!" }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: "POST",
      isBase64Encoded: false,
      path: "/",
      pathParameters: null,
      queryStringParameters: {
        test: "test",
      },
      multiValueQueryStringParameters: {
        test: ["test"],
      },
      stageVariables: null,
      requestContext: {
        identity: {
          sourceIp: "::1",
        },
      } as any,
      resource: "",
    };

    const response = await converter.convertFrom(event);

    expect(response).toEqual({
      type: "core",
      method: "POST",
      rawPath: "/",
      url: "/?test=test",
      body: Buffer.from('{"message":"Hello, world!"}'),
      headers: {},
      remoteAddress: "::1",
      query: {
        test: ["test"],
      },
      cookies: {},
    });
  });

  it("Should handle cookies", async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ message: "Hello, world!" }),
      headers: {
        "content-type": "application/json",
      },
      multiValueHeaders: {
        cookie: ["test1=1", "test2=2"],
      },
      httpMethod: "POST",
      isBase64Encoded: false,
      path: "/",
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        identity: {
          sourceIp: "::1",
        },
      } as any,
      resource: "",
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
        cookie: "test1=1,test2=2",
      },
      remoteAddress: "::1",
      query: {},
      cookies: {
        test1: "1",
        test2: "2",
      },
    });
  });

  it("Should handle base64 encoded body", async () => {
    const event: APIGatewayProxyEvent = {
      body: Buffer.from("Hello, world!").toString("base64"),
      headers: {
        "content-type": "application/json",
      },
      multiValueHeaders: {},
      httpMethod: "GET",
      isBase64Encoded: true,
      path: "/",
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        identity: {
          sourceIp: "::1",
        },
      } as any,
      resource: "",
    };

    const response = await converter.convertFrom(event);

    expect(response).toEqual({
      type: "core",
      method: "GET",
      rawPath: "/",
      url: "/",
      body: Buffer.from("Hello, world!"),
      headers: {
        "content-type": "application/json",
      },
      remoteAddress: "::1",
      query: {},
      cookies: {},
    });
  });
});
