import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
import type { CDNInvalidationHandler } from "types/overrides";

const cloudfront = new CloudFrontClient({});
export default {
  name: "cloudfront",
  invalidatePaths: async (paths) => {
    //TODO: test the constructed paths
    const constructedPaths = paths.flatMap(({ path, isAppRouter }) =>
      isAppRouter
        ? [`${path}`, `${path}?_rsc=*`]
        : [
            `${path}`,
            `_next/data/${process.env.BUILD_ID}${path === "/" ? "/index" : path}.json*`,
          ],
    );
    await cloudfront.send(
      new CreateInvalidationCommand({
        DistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID!,
        InvalidationBatch: {
          // Do we need to limit the number of paths? Or batch them into multiple commands?
          Paths: { Quantity: constructedPaths.length, Items: constructedPaths },
          CallerReference: `${Date.now()}`,
        },
      }),
    );
  },
} satisfies CDNInvalidationHandler;
