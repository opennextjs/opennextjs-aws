import type { TagCache } from "types/overrides";

// We don't want to throw error on this one because we might use it when we don't need tag cache
const dummyTagCache: TagCache = {
  name: "dummy",
  getByPath: async () => {
    return [];
  },
  getByTag: async () => {
    return [];
  },
  getLastModified: async (_: string, lastModified) => {
    return lastModified ?? Date.now();
  },
  writeTags: async () => {
    return;
  },
};

export default dummyTagCache;
