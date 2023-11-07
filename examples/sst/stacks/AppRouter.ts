import { NextjsSite } from "sst/constructs";

export function AppRouter({ stack }) {
  const site = new NextjsSite(stack, "approuter", {
    path: "../app-router",
    buildCommand: "npm run openbuild",
    bind: [],
    environment: {},
    timeout: "20 seconds",
    experimental: {
      streaming: true,
    },
  });

  stack.addOutputs({
    url: site.url,
  });
}
