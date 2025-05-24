import type { SSTConfig } from "sst";

import { AppPagesRouter } from "./stacks/AppPagesRouter";

export default {
  config(_input) {
    return {
      name: "example",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app
      // .stack(AppRouter)
      // .stack(PagesRouter)
      .stack(AppPagesRouter);
    // .stack(Experimental);
  },
} satisfies SSTConfig;
