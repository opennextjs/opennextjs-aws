import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { Queue } from "types/overrides";

import { awsLogger } from "../../adapters/logger";

// Expected environment variables
const { REVALIDATION_QUEUE_REGION, REVALIDATION_QUEUE_URL } = process.env;

const sqsClient = new SQSClient({
  region: REVALIDATION_QUEUE_REGION,
  logger: awsLogger,
});

const queue: Queue = {
  send: async ({ MessageBody, MessageDeduplicationId, MessageGroupId }) => {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: REVALIDATION_QUEUE_URL,
        MessageBody: JSON.stringify(MessageBody),
        MessageDeduplicationId,
        MessageGroupId,
      }),
    );
  },
  name: "sqs",
};

export default queue;
