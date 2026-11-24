import { OpenNextNodeResponse } from "@opennextjs/aws/http/openNextResponse.js";
import cloudflareNode from "@opennextjs/aws/overrides/wrappers/cloudflare-node.js";
import type {
  InternalEvent,
  StreamCreator,
} from "@opennextjs/aws/types/open-next.js";
import type { Converter } from "@opennextjs/aws/types/overrides.js";

/**
 * Runs a request through the wrapper.
 *
 * @param handler Populates the response
 * @returns The response returned to the runtime
 */
async function fetchWith(
  handler: (res: OpenNextNodeResponse) => void,
): Promise<Response> {
  const fetch = await cloudflareNode.wrapper(
    async (
      _event: InternalEvent,
      options?: { streamCreator?: StreamCreator },
    ) => {
      const res = new OpenNextNodeResponse(
        () => {},
        async () => {},
        options?.streamCreator,
      );
      res.on("error", () => {});
      handler(res);
      return {} as never;
    },
    { convertFrom: async () => ({}) } as unknown as Converter,
  );
  return fetch(
    new Request("https://example.com/"),
    {},
    { waitUntil: () => {} },
    new AbortController().signal,
  );
}

describe("wrappers/cloudflare-node", () => {
  it("returns a 500 when the response is destroyed before the headers", async () => {
    const response = await fetchWith((res) => {
      res.setHeader("set-cookie", ["session=secret"]);
      res.destroy(new Error("boom"));
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toBe("");
  });

  it("returns a response sent after the handler settles", async () => {
    // e.g. a Pages API route with `externalResolver`
    const response = await fetchWith((res) => {
      setTimeout(() => res.end("late"), 10);
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("late");
  });
});
