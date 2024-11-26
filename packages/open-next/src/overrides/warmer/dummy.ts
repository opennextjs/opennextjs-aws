import type { Warmer } from "types/overrides";
import { FatalError } from "utils/error";

const dummyWarmer: Warmer = {
  name: "dummy",
  invoke: async (_: string) => {
    throw new FatalError("Dummy warmer is not implemented");
  },
};

export default dummyWarmer;
