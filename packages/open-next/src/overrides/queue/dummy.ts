import type { Queue } from "types/overrides";
import { FatalError } from "utils/error";

const dummyQueue: Queue = {
  name: "dummy",
  send: async () => {
    throw new FatalError("Dummy queue is not implemented");
  },
};

export default dummyQueue;
