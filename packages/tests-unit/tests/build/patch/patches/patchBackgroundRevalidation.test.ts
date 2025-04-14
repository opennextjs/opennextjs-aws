import { patchCode } from "@opennextjs/aws/build/patch/astCodePatcher.js";
import { rule } from "@opennextjs/aws/build/patch/patches/patchBackgroundRevalidation.js";
import { describe, it } from "vitest";

const codeToPatch = `if (cachedResponse && !isOnDemandRevalidate) {
                    var _cachedResponse_value;
                    if (((_cachedResponse_value = cachedResponse.value) == null ? void 0 : _cachedResponse_value.kind) === _types.CachedRouteKind.FETCH) {
                        throw new Error(\`invariant: unexpected cachedResponse of kind fetch in response cache\`);
                    }
                    resolve({
                        ...cachedResponse,
                        revalidate: cachedResponse.curRevalidate
                    });
                    resolved = true;
                    if (!cachedResponse.isStale || context.isPrefetch) {
                        // The cached value is still valid, so we don't need
                        // to update it yet.
                        return null;
                    }
                }`;

describe("patchBackgroundRevalidation", () => {
  it("Should patch code", () => {
    expect(
      patchCode(codeToPatch, rule),
    ).toMatchInlineSnapshot(`"if (cachedResponse && !isOnDemandRevalidate) {
                    var _cachedResponse_value;
                    if (((_cachedResponse_value = cachedResponse.value) == null ? void 0 : _cachedResponse_value.kind) === _types.CachedRouteKind.FETCH) {
                        throw new Error(\`invariant: unexpected cachedResponse of kind fetch in response cache\`);
                    }
                    resolve({
                        ...cachedResponse,
                        revalidate: cachedResponse.curRevalidate
                    });
                    resolved = true;
                    if (true) {
                        // The cached value is still valid, so we don't need
                        // to update it yet.
                        return null;
                    }
                }"`);
  });
});
