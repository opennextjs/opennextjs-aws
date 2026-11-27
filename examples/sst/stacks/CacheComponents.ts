import type { StackContext } from "sst/constructs";
import { OpenNextCdkReferenceImplementation } from "./OpenNextReferenceImplementation";

export function CacheComponents({ stack }: StackContext) {
  const site = new OpenNextCdkReferenceImplementation(
    stack,
    "cache-components",
    {
      path: "../cache-components",
      environment: {
        OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE: "true",
      },
    },
  );

  stack.addOutputs({
    url: `https://${site.distribution.domainName}`,
  });
}
