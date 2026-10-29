import type { Queue } from "types/overrides.js";
import { ISR_HEADER, PRERENDER_REVALIDATE_HEADER } from "utils/cacheHeaders.js";

const queue: Queue = {
  name: "dev-queue",
  send: async (message) => {
    const prerenderManifest = (await import("../../adapters/config/index.js"))
      .PrerenderManifest as any;
    const { host, url } = message.MessageBody;
    const protocol = host.includes("localhost") ? "http" : "https";
    const revalidateId: string = prerenderManifest.preview.previewModeId;
    await globalThis.internalFetch(`${protocol}://${host}${url}`, {
      method: "HEAD",
      headers: {
        [PRERENDER_REVALIDATE_HEADER]: revalidateId,
        [ISR_HEADER]: "1",
      },
    });
  },
};

export default queue;
