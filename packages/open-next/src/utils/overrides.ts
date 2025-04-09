import type { WarmerEvent, WarmerResponse } from "../adapters/warmer-function";

export function formatWarmerResponse(event: WarmerEvent) {
  return new Promise<WarmerResponse>((resolve) => {
    setTimeout(() => {
      resolve({ serverId, type: "warmer" } satisfies WarmerResponse);
    }, event.delay);
  });
}
