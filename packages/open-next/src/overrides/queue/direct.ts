import type { Queue } from "types/overrides.js";

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
        "x-prerender-revalidate": revalidateId,
        "x-isr": "1",
      },
    });
  },
};

export default queue;
