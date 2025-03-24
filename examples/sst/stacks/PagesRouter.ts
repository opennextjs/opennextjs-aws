import { OpenNextCdkReferenceImplementation } from "./OpenNextReferenceImplementation";

export function PagesRouter({ stack }) {
  const site = new OpenNextCdkReferenceImplementation(stack, "pagesrouter", {
    path: "../pages-router",
    /*
     * We need to set this environment variable to not break other E2E tests that have an empty body. (i.e: /redirect)
     * https://opennext.js.org/aws/common_issues#empty-body-in-response-when-streaming-in-aws-lambda
     *
     */
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
