import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

export default {
  default: {
    override: {
      wrapper: "aws-lambda-streaming",
      queue: "sqs-lite",
      incrementalCache: "s3-lite",
      tagCache: "dynamodb-lite",
    },
  },
} satisfies OpenNextConfig;
