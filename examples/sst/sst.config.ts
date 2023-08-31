import { SSTConfig } from "sst";

import { AppPagesRouter } from "./stacks/AppPagesRouter";
import { AppRouter } from "./stacks/AppRouter";
import { PagesRouter } from "./stacks/PagesRouter";

export default {
  config(_input) {
    return {
      name: "example",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(AppRouter).stack(PagesRouter).stack(AppPagesRouter);
  },
} satisfies SSTConfig;
