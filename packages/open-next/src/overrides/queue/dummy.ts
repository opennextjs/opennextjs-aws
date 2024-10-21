import { Queue } from "./types";

const dummyQueue: Queue = {
  name: "dummy",
  send: async () => {
    throw new Error("Dummy queue is not implemented");
  },
};

export default dummyQueue;
