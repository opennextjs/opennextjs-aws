import { NextjsSite } from "sst/constructs";

// NOTE: App Pages Router doesn't do streaming
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
