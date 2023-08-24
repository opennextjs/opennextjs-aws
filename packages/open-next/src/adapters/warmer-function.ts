import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { Context } from "aws-lambda";

import { debug, error } from "./logger.js";
import { generateUniqueId } from "./util.js";

const lambda = new LambdaClient({});
const FUNCTION_NAME = process.env.FUNCTION_NAME!;
const CONCURRENCY = parseInt(process.env.CONCURRENCY!);

export interface WarmerEvent {
  type: "warmer";
  warmerId: string;
  index: number;
  concurrency: number;
  delay: number;
}

export interface WarmerResponse {
  serverId: string;
}

export async function handler(_event: any, context: Context) {
  const warmerId = `warmer-${generateUniqueId()}`;
  debug({
    event: "warmer invoked",
    functionName: FUNCTION_NAME,
    concurrency: CONCURRENCY,
    warmerId,
  });

  // Warm
  const ret = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_v, i) => i).map((i) => {
      try {
        return lambda.send(
          new InvokeCommand({
            FunctionName: FUNCTION_NAME,
            InvocationType: "RequestResponse",
            Payload: Buffer.from(
              JSON.stringify({
                type: "warmer",
                warmerId,
                index: i,
                concurrency: CONCURRENCY,
                delay: 75,
              } satisfies WarmerEvent),
            ),
          }),
        );
      } catch (e) {
        error(`failed to warm up #${i}`, e);
        // ignore error
      }
    }),
  );

  // Print status
  const warmedServerIds: string[] = [];
  ret.forEach((r, i) => {
    if (r?.StatusCode !== 200 || !r?.Payload) {
      error(`failed to warm up #${i}:`, r?.Payload?.toString());
      return;
    }
    const payload = JSON.parse(
      Buffer.from(r.Payload).toString(),
    ) as WarmerResponse;
    warmedServerIds.push(payload.serverId);
  });
  debug({
    event: "warmer result",
    sent: CONCURRENCY,
    success: warmedServerIds.length,
    uniqueServersWarmed: [...new Set(warmedServerIds)].length,
  });
}
