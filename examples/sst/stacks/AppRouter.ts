import { NextjsSite } from "./NextjsSite";

export function AppRouter({ stack }) {
  const site = new NextjsSite(stack, "approuter", {
    path: "../app-router",
    buildCommand: "npm run openbuild",
    bind: [],
    environment: {},
    timeout: "20 seconds",
  });

  stack.addOutputs({
    url: site.url,
  });
}
