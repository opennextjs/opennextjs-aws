import { OpenNextCdkReferenceImplementation } from "./OpenNextReferenceImplementation";

export function PagesRouter({ stack }) {
  const site = new OpenNextCdkReferenceImplementation(stack, "pagesrouter", {
    path: "../pages-router",
    environment: {
      OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE: "true",
    },
  });
  // const site = new NextjsSite(stack, "pagesrouter", {
  //   path: "../pages-router",
  //   buildCommand: "npm run openbuild",
  //   bind: [],
  //   environment: {},
  // });

  stack.addOutputs({
    url: `https://${site.distribution.domainName}`,
  });
}
