import type { AssetResolver } from "types/overrides";

/**
 * A dummy asset resolver.
 *
 * It never overrides the result with an asset.
 */
const resolver: AssetResolver = {
  name: "dummy",
};

export default resolver;
