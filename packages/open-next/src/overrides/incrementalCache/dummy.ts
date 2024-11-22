import type { IncrementalCache } from "types/overrides";
import { IgnorableError } from "utils/error";

const dummyIncrementalCache: IncrementalCache = {
  name: "dummy",
  get: async () => {
    throw new IgnorableError('"Dummy" cache does not cache anything');
  },
  set: async () => {
    throw new IgnorableError('"Dummy" cache does not cache anything');
  },
  delete: async () => {
    throw new IgnorableError('"Dummy" cache does not cache anything');
  },
};

export default dummyIncrementalCache;
