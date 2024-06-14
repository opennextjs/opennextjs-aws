import { OpenNextCdkReferenceImplementation } from "./OpenNextReferenceImplementation";

export function AppRouter({ stack }) {
  // We should probably switch to ion once it's ready
  const site = new OpenNextCdkReferenceImplementation(stack, "approuter", {
    path: "../app-router",
    environment: {
      OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE: "true",
    },
  });
  // const site = new NextjsSite(stack, "approuter", {
  //   path: "../app-router",
  //   buildCommand: "npm run openbuild",
  //   bind: [],
  //   environment: {},
  //   timeout: "20 seconds",
  //   experimental: {
  //     streaming: true,
  //   },
  // });

  stack.addOutputs({
    url: `https://${site.distribution.domainName}`,
  });
}
