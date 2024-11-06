import type { IncrementalCache } from "types/overrides";

const dummyIncrementalCache: IncrementalCache = {
  name: "dummy",
  get: async () => {
    throw new Error("Dummy cache is not implemented");
  },
  set: async () => {
    throw new Error("Dummy cache is not implemented");
  },
  delete: async () => {
    throw new Error("Dummy cache is not implemented");
  },
};

export default dummyIncrementalCache;
