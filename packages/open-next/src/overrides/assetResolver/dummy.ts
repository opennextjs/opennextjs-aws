import type { InternalEvent } from "types/open-next";
import type { AssetResolver } from "types/overrides";

const resolver: AssetResolver = {
  name: "dummy",
  // @returns `undefined` to preserve the routing layer default behavior (404 page)
  onRouteNotFound: (_event: InternalEvent) => undefined,
};

export default resolver;
