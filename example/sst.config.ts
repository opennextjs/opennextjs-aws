import { SSTConfig } from "sst";
import { Config, NextjsSite } from "sst/constructs";

export default {
  config(_input) {
    return {
      name: "example",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(function Site({ stack }) {
      const site = new NextjsSite(stack, "site",{
        bind: [
          new Config.Secret(stack, "GITHUB_CLIENT_ID"),
          new Config.Secret(stack, "GITHUB_CLIENT_SECRET"),
          new Config.Secret(stack, "NEXTAUTH_SECRET"),
        ],
      });

      stack.addOutputs({
        SiteUrl: site.url,
      });
    });
  },
} satisfies SSTConfig;
