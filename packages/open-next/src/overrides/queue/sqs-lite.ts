import { AwsClient } from "aws4fetch";
import type { Queue } from "types/overrides";
import { RecoverableError } from "utils/error";
import { customFetchClient } from "utils/fetch";

import { error } from "../../adapters/logger";

let awsClient: AwsClient | null = null;

const getAwsClient = () => {
  if (awsClient) {
    return awsClient;
  }
  awsClient = new AwsClient({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: process.env.REVALIDATION_QUEUE_REGION,
  });
  return awsClient;
};

const awsFetch = (body: RequestInit["body"]) => {
  const { REVALIDATION_QUEUE_REGION } = process.env;
  const client = getAwsClient();
  return customFetchClient(client)(
    `https://sqs.${REVALIDATION_QUEUE_REGION ?? "us-east-1"}.amazonaws.com`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.0",
        "X-Amz-Target": "AmazonSQS.SendMessage",
      },
      body,
    },
  );
};
const queue: Queue = {
  send: async ({ MessageBody, MessageDeduplicationId, MessageGroupId }) => {
    const send = (async () => {
      try {
        const { REVALIDATION_QUEUE_URL } = process.env;
        const result = await awsFetch(
          JSON.stringify({
            QueueUrl: REVALIDATION_QUEUE_URL,
            MessageBody: JSON.stringify(MessageBody),
            MessageDeduplicationId,
            MessageGroupId,
          }),
        );
        if (result.status !== 200) {
          throw new RecoverableError(
            `Failed to send message: ${result.status}`,
          );
        }
      } catch (e) {
        error(e);
      }
    })();

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
