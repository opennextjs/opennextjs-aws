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
    const send = sqsClient
      .send(
        new SendMessageCommand({
          QueueUrl: REVALIDATION_QUEUE_URL,
          MessageBody: JSON.stringify(MessageBody),
          MessageDeduplicationId,
          MessageGroupId,
        }),
      )
      .then(() => undefined);

    // Enqueuing revalidation should not block the response. When the wrapper
    // provides a `waitUntil`, hand the send to it and return immediately so the
    // SQS round trip runs after the body is flushed; otherwise (edge, or a
    // wrapper without `waitUntil`) fall back to awaiting it inline.
    const waitUntil = globalThis.__openNextAls.getStore()?.waitUntil;
    if (waitUntil) {
      waitUntil(send);
      return;
    }

    await send;
  },
  name: "sqs",
};

export default queue;
