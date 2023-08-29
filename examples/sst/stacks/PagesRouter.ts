import { NextjsSite } from "sst/constructs";

export function PagesRouter({ stack }) {
  const site = new NextjsSite(stack, "pagesrouter", {
    path: "../pages-router",
    buildCommand: "npm run openbuild",
    bind: [],
    environment: {},
  });

  stack.addOutputs({
    url: site.url,
  });
}
