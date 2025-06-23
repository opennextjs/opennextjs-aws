import { OpenNextCdkReferenceImplementation } from "./OpenNextReferenceImplementation";

export function AppRouter({ stack }) {
  // We should probably switch to ion once it's ready
  const site = new OpenNextCdkReferenceImplementation(stack, "approuter", {
    path: "../app-router",
    environment: {
      OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE: "true",
      // We want to always add the request ID header
      OPEN_NEXT_REQUEST_ID_HEADER: "true",
    },
  });

  stack.addOutputs({
    url: `https://${site.distribution.domainName}`,
  });
}
