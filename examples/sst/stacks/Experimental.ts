import { OpenNextCdkReferenceImplementation } from "./OpenNextReferenceImplementation";

export function Experimental({ stack }) {
  const site = new OpenNextCdkReferenceImplementation(stack, "experimental", {
    path: "../experimental",
    environment: {
      OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE: "true",
    },
  });

  stack.addOutputs({
    url: `https://${site.distribution.domainName}`,
  });
}
