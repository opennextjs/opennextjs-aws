import type { OriginResolver } from "types/open-next";

const dummyOriginResolver: OriginResolver = {
  name: "dummy",
  resolve: async (_path: string) => {
    return false as const;
  },
};

export default dummyOriginResolver;
