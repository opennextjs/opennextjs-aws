import { NextjsSite } from "sst/constructs";

export function PagesOnly({ stack }) {
  const site = new NextjsSite(stack, "pagesonly",{
    path: '../packages/pages-only',
    buildCommand: 'npm run openbuild',
    bind: [
    ],
    environment: {
    }
  });

  stack.addOutputs({
    url: site.url,
  });
}