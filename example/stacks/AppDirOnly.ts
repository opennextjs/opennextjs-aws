import { NextjsSite } from "sst/constructs";

export function AppDirOnly({ stack }) {
  const site = new NextjsSite(stack, "appdironly",{
    path: '../packages/app-dir',
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