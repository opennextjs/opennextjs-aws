import { convertRes } from "@opennextjs/aws/core/routing/util.js";
import { OpenNextNodeResponse } from "@opennextjs/aws/http/openNextResponse.js";
import awsLambda from "@opennextjs/aws/overrides/wrappers/aws-lambda.js";
import type {
  InternalEvent,
  InternalResult,
  StreamCreator,
} from "@opennextjs/aws/types/open-next.js";
import type { Converter } from "@opennextjs/aws/types/overrides.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => ({
  NextConfig: {},
}));

describe("wrappers/aws-lambda", () => {
  it("returns a non-cacheable 500 when the response is destroyed before the headers", async () => {
    const lambda = await awsLambda.wrapper(
      async (
        _event: InternalEvent,
        options?: { streamCreator?: StreamCreator },
      ) => {
        const res = new OpenNextNodeResponse(
          () => {},
          async () => {},
          options?.streamCreator,
        );
        res.statusCode = 200;
        res.setHeader("cache-control", "s-maxage=31536000");
        res.setHeader("set-cookie", ["session=secret"]);
        res.destroy(new Error("boom"));
        // Like Next.js rendering an error page in the destroyed response
        res.setHeader("set-cookie", ["late=1"]);
        res.writeHead(404, { "x-late": "1" });
        await new Promise((resolve) => res.on("close", resolve));
        // What the request handler returns
        return convertRes(res);
      },
      {
        convertFrom: async () => ({}),
        convertTo: async (result: InternalResult) => result,
      } as unknown as Converter,
    );

    const result = (await lambda({}, {})) as unknown as InternalResult;

    expect(result.statusCode).toBe(500);
    expect(result.headers["cache-control"]).toBe(
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
    expect(result.headers["set-cookie"]).toBeFalsy();
    expect(result.headers).not.toHaveProperty("x-late");
    expect((await result.body.getReader().read()).done).toBe(true);
  });
});
