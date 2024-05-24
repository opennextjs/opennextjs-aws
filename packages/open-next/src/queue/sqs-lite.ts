import { AwsClient } from "aws4fetch";

import { Queue } from "./types";

// Expected environment variables
const { REVALIDATION_QUEUE_REGION, REVALIDATION_QUEUE_URL } = process.env;

const awsClient = new AwsClient({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: REVALIDATION_QUEUE_REGION,
});
const queue: Queue = {
  send: async ({ MessageBody, MessageDeduplicationId, MessageGroupId }) => {
    const result = await awsClient.fetch(
      `https://sqs.${REVALIDATION_QUEUE_REGION ?? "us-east-1"}.amazonaws.com`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-amz-json-1.0",
          "X-Amz-Target": "AmazonSQS.SendMessage",
        },
        body: JSON.stringify({
          QueueUrl: REVALIDATION_QUEUE_URL,
          MessageBody: JSON.stringify(MessageBody),
          MessageDeduplicationId,
          MessageGroupId,
        }),
      },
    );
    const jsonResult = await result.json();
    console.log("result", result.status, jsonResult, process.env);
  },
  name: "sqs",
};

export default queue;
