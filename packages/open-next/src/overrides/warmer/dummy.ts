import type { Warmer } from "types/open-next";

const dummyWarmer: Warmer = {
  name: "dummy",
  invoke: async (_: string) => {
    throw new Error("Dummy warmer is not implemented");
  },
};

export default dummyWarmer;
