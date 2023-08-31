import { NextjsSite } from "sst/constructs";

export function AppPagesRouter({ stack }) {
  const site = new NextjsSite(stack, "apppagesrouter", {
    path: "../app-pages-router",
    buildCommand: "npm run openbuild",
    bind: [],
    environment: {},
  });

  stack.addOutputs({
    url: site.url,
  });
}
