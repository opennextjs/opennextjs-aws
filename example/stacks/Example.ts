import { Config, NextjsSite } from "sst/constructs";

export function Example({ stack }) {
  const site = new NextjsSite(stack, "site",{
    bind: [
      new Config.Secret(stack, "GITHUB_CLIENT_ID"),
      new Config.Secret(stack, "GITHUB_CLIENT_SECRET"),
      new Config.Secret(stack, "NEXTAUTH_SECRET"),
    ],
    environment: {
      NEXTAUTH_URL: "https://d1gwt3w78t4dm3.cloudfront.net",
    }
  });

  stack.addOutputs({
    SiteUrl: site.url,
  });
}