import { createGenericHandler } from "../core/createGenericHandler.js";
import { resolveWarmerInvoke } from "../core/resolve.js";
import { generateUniqueId } from "./util.js";

export interface WarmerEvent {
  type: "warmer";
  warmerId: string;
  index: number;
  concurrency: number;
  delay: number;
}

export interface WarmerResponse {
  type: "warmer";
  serverId: string;
}

export const handler = await createGenericHandler({
  handler: defaultHandler,
  type: "warmer",
});

async function defaultHandler() {
  const warmerId = `warmer-${generateUniqueId()}`;

  const invokeFn = await resolveWarmerInvoke(
    globalThis.openNextConfig.warmer?.invokeFunction,
  );

  await invokeFn.invoke(warmerId);

  return {
    type: "warmer",
  };
}
