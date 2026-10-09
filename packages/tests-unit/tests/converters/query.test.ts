import { convertToQueryString } from "@opennextjs/aws/core/routing/util.js";
import { IncomingMessage } from "@opennextjs/aws/http/request.js";
import apiGatewayV1Converter from "@opennextjs/aws/overrides/converters/aws-apigw-v1.js";
import apiGatewayV2Converter from "@opennextjs/aws/overrides/converters/aws-apigw-v2.js";
import cloudFrontConverter from "@opennextjs/aws/overrides/converters/aws-cloudfront.js";
import edgeConverter from "@opennextjs/aws/overrides/converters/edge.js";
import nodeConverter from "@opennextjs/aws/overrides/converters/node.js";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  CloudFrontRequestEvent,
} from "aws-lambda";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({}));

// Next.js stores decoded query values and encodes them when rendering a URL.
// https://github.com/vercel/next.js/blob/3439bde/packages/next/src/shared/lib/router/utils/querystring.ts#L34-L75
const rawQuery =
  "redirect=https%3A%2F%2Fexample.com%2Fcallback%3Fnext%3D%252Faccount%253Ftab%253Dbilling%26token%3Da%252Bb%2526c&reserved=%26%3D%2B%25%23%3F%2F%3A%40%24%2C%3B&space=hello+world&tag=x&tag=a%26b";

const decodedQuery = {
  redirect:
    "https://example.com/callback?next=%2Faccount%3Ftab%3Dbilling&token=a%2Bb%26c",
  reserved: "&=+%#?/:@$,;",
  space: "hello world",
  tag: ["x", "a&b"],
};

describe("query encoding", () => {
  it("round-trips decoded Node query values", async () => {
    const result = await nodeConverter.convertFrom(
      new IncomingMessage({
        url: `/?${rawQuery}`,
        method: "GET",
        headers: {
          "content-length": "0",
        },
      }),
    );

    expect(result.query).toEqual(decodedQuery);
    expect(convertToQueryString(result.query)).toBe(`?${rawQuery}`);
  });

  it("round-trips decoded Edge query values", async () => {
    const result = await edgeConverter.convertFrom(
      new Request(`https://example.com/?${rawQuery}`),
    );

    expect(result.query).toEqual(decodedQuery);
    expect(convertToQueryString(result.query)).toBe(`?${rawQuery}`);
  });

  it("round-trips decoded API Gateway v1 query values", async () => {
    const event: APIGatewayProxyEvent = {
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: "GET",
      isBase64Encoded: false,
      path: "/",
      pathParameters: null,
      queryStringParameters: {
        redirect: decodedQuery.redirect,
        reserved: decodedQuery.reserved,
        space: decodedQuery.space,
        tag: decodedQuery.tag[1],
      },
      multiValueQueryStringParameters: {
        redirect: [decodedQuery.redirect],
        reserved: [decodedQuery.reserved],
        space: [decodedQuery.space],
        tag: decodedQuery.tag,
      },
      stageVariables: null,
      requestContext: {
        identity: {
          sourceIp: "::1",
        },
      } as APIGatewayProxyEvent["requestContext"],
      resource: "",
    };

    const result = await apiGatewayV1Converter.convertFrom(event);

    expect(result.query).toEqual(decodedQuery);
    expect(result.url).toBe(`https://on/?${rawQuery}`);
    expect(convertToQueryString(result.query)).toBe(`?${rawQuery}`);
  });

  it("round-trips decoded API Gateway v2 query values", async () => {
    const event: APIGatewayProxyEventV2 = {
      rawPath: "/",
      rawQueryString: rawQuery,
      headers: {},
      version: "2.0",
      routeKey: "",
      isBase64Encoded: false,
      requestContext: {
        http: {
          method: "GET",
          sourceIp: "::1",
        },
      } as APIGatewayProxyEventV2["requestContext"],
    };

    const result = await apiGatewayV2Converter.convertFrom(event);

    expect(result.query).toEqual(decodedQuery);
    expect(convertToQueryString(result.query)).toBe(`?${rawQuery}`);
  });

  it("round-trips decoded CloudFront query values", async () => {
    const event: CloudFrontRequestEvent = {
      Records: [
        {
          cf: {
            config: {
              distributionDomainName: "d123.cloudfront.net",
              distributionId: "EDFDVBD6EXAMPLE",
              eventType: "origin-request",
              requestId: "EXAMPLE",
            },
            request: {
              clientIp: "::1",
              headers: {
                host: [{ key: "host", value: "example.com" }],
              },
              method: "GET",
              querystring: rawQuery,
              uri: "/",
            },
          },
        },
      ],
    };
    const internalEvent = await cloudFrontConverter.convertFrom(event);

    expect(internalEvent.query).toEqual(decodedQuery);
    expect(convertToQueryString(internalEvent.query)).toBe(`?${rawQuery}`);

    const result = await cloudFrontConverter.convertTo(
      {
        type: "middleware",
        internalEvent,
        isExternalRewrite: false,
        origin: false,
        isISR: false,
        initialURL: internalEvent.url,
        resolvedRoutes: [],
      },
      event,
    );

    expect(result).toEqual(expect.objectContaining({ querystring: rawQuery }));
  });
});
