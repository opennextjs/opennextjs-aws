import fs from "node:fs/promises";
import path from "node:path";

import type { IncrementalCache } from "types/overrides.js";
import { getOutputDir } from "utils/normalize-path";

const buildId = process.env.NEXT_BUILD_ID;
const basePath = path.join(getOutputDir(), `cache/${buildId}`);

const getCacheKey = (key: string) => {
  return path.join(basePath, `${key}.cache`);
};

const cache: IncrementalCache = {
  name: "fs-dev",
  get: async (key: string) => {
    const fileData = await fs.readFile(getCacheKey(key), "utf-8");
    const data = JSON.parse(fileData);
    const { mtime } = await fs.stat(getCacheKey(key));
    return {
      value: data,
      lastModified: mtime.getTime(),
    };
  },
  set: async (key, value, isFetch) => {
    const data = JSON.stringify(value);
    const cacheKey = getCacheKey(key);
    // We need to create the directory before writing the file
    await fs.mkdir(path.dirname(cacheKey), { recursive: true });
    await fs.writeFile(cacheKey, data);
  },
  delete: async (key) => {
    await fs.rm(getCacheKey(key));
  },
};

export default cache;
