import fs from "node:fs";
import path from "node:path";

import type { ImageLoader } from "types/overrides";
import { getMonorepoRelativePath } from "utils/normalize-path";

export default {
  name: "fs-dev",
  load: async (url: string) => {
    const imagePath = path.join(getMonorepoRelativePath(), "assets", url);
    const body = fs.createReadStream(imagePath);
    const contentType = url.endsWith(".png") ? "image/png" : "image/jpeg";
    return {
      body,
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    };
  },
} satisfies ImageLoader;
