import { OpenNextCdkReferenceImplementation } from "./OpenNextReferenceImplementation";

export function PagesRouter({ stack }) {
  const site = new OpenNextCdkReferenceImplementation(stack, "pagesrouter", {
    path: "../pages-router",
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
