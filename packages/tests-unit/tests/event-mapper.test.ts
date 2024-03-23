import { CloudFrontRequestResult } from "aws-lambda";

//TODO: rewrite this test to use converter instead of event-mapper
import { convertTo } from "../../open-next/src/adapters/event-mapper";

describe("convertTo", () => {
  describe("CloudFront Result", () => {
    it("Should parse the headers", () => {
      const response = convertTo({
        body: "",
        headers: {
          "content-type": "application/json",
          test: "test",
        },
        isBase64Encoded: false,
        statusCode: 200,
        type: "cf",
      }) as CloudFrontRequestResult;

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

    it("Should parse the headers with arrays", () => {
      const response = convertTo({
        body: "",
        headers: {
          test: ["test1", "test2"],
        },
        isBase64Encoded: false,
        statusCode: 200,
        type: "cf",
      }) as CloudFrontRequestResult;

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

    it("Should parse the headers with cookies", () => {
      const response = convertTo({
        body: "",
        headers: {
          "set-cookie":
            "test=1; Path=/; HttpOnly; Secure; SameSite=None, test=2; Path=/; HttpOnly; Secure; SameSite=None",
        },
        isBase64Encoded: false,
        statusCode: 200,
        type: "cf",
      }) as CloudFrontRequestResult;

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

    it("Should parse the headers with cookies + expires", () => {
      const response = convertTo({
        body: "",
        headers: {
          "set-cookie":
            "test=1; Path=/; Expires=Sun, 14 Apr 2024 22:19:07 GMT; HttpOnly; Secure; SameSite=None, test=2; Path=/; Expires=Sun, 14 Apr 2024 22:19:07 GMT; HttpOnly; Secure; SameSite=None",
        },
        isBase64Encoded: false,
        statusCode: 200,
        type: "cf",
      }) as CloudFrontRequestResult;

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
  });
});
