import type { ImageLoader } from "types/overrides";
import { FatalError } from "utils/error";

const dummyLoader: ImageLoader = {
  name: "dummy",
  load: async (_: string) => {
    throw new FatalError("Dummy loader is not implemented");
  },
};

export default dummyLoader;
