import type { ImageLoader } from "types/overrides";
import fs from "node:fs/promises";
import { Readable } from "node:stream";

export default {
  name: "fs-dev",
  load: async (url: string) => {
    const basePath = "../../assets";
    const fileData = await fs.readFile(`${basePath}/${url}`);
    const contentType = url.endsWith(".png") ? "image/png" : "image/jpeg";
    return {
      body: Readable.from(fileData),
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    };
  },
} satisfies ImageLoader;
