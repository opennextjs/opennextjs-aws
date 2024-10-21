import { IncrementalCache } from "./types";

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
