import { createMainHandler } from "@opennextjs/aws/core/createMainHandler.js";
import { vi } from "vitest";

const calls: string[] = [];

// `./open-next.config.mjs` only exists in the build output: the unresolved import id is mocked as is.
vi.mock("./open-next.config.mjs", () => ({
  default: { default: {} },
}));

vi.mock("@opennextjs/aws/core/requestHandler.js", () => ({
  openNextHandler: vi.fn(),
}));

vi.mock("@opennextjs/aws/core/resolve.js", () => {
  const resolved = (name: string) => async () => {
    calls.push(name);
    return {};
  };
  return {
    resolveAssetResolver: resolved("assetResolver"),
    resolveCdnInvalidation: resolved("cdnInvalidation"),
    resolveConverter: resolved("converter"),
    resolveIncrementalCache: resolved("incrementalCache"),
    resolveProxyRequest: resolved("proxyRequest"),
    resolveQueue: resolved("queue"),
    resolveTagCache: resolved("tagCache"),
    resolveWrapper: async () => {
      calls.push("wrapper");
      return {
        name: "test",
        wrapper: async () => {
          calls.push("wrapper factory");
          return async () => new Response();
        },
      };
    },
  };
});

describe("createMainHandler", () => {
  it("resolves the wrapper before the routes are preloaded", async () => {
    globalThis.__next_route_preloader = async (stage) => {
      calls.push(`preload ${stage}`);
    };

    await createMainHandler();

    expect(calls[0]).toBe("wrapper");
    expect(calls.indexOf("wrapper")).toBeLessThan(
      calls.indexOf("preload start"),
    );
    expect(calls.at(-1)).toBe("wrapper factory");
  });
});
