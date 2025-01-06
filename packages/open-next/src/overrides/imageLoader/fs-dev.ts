import fs from "node:fs";
import type { ImageLoader } from "types/overrides";

export default {
  name: "fs-dev",
  load: async (url: string) => {
    const basePath = "../../assets";
    const body = fs.createReadStream(`${basePath}/${url}`);
    const contentType = url.endsWith(".png") ? "image/png" : "image/jpeg";
    return {
      body,
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    };
  },
} satisfies ImageLoader;
