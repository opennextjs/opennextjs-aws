import type { CDNInvalidationHandler } from "types/overrides";

export default {
  name: "dummy",
  invalidatePaths: (_) => {
    return Promise.resolve();
  },
} satisfies CDNInvalidationHandler;
