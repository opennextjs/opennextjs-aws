import { SSTConfig } from "sst";

import { AppDirOnly } from "./stacks/AppDirOnly";
import { PagesOnly } from "./stacks/PagesOnly";

export default {
  config(_input) {
    return {
      name: "example",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(AppDirOnly).stack(PagesOnly);
  },
} satisfies SSTConfig;
