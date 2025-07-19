import fs from "node:fs/promises";
import path from "node:path";

import type { CacheKey, IncrementalCache } from "types/overrides.js";
import { getMonorepoRelativePath } from "utils/normalize-path";

const basePath = path.join(getMonorepoRelativePath(), "cache");

const getCacheKey = (key: string) => {
  return path.join(basePath, `${key}.cache`);
};

const cache: IncrementalCache = {
  name: "fs-dev",
  get: async (cacheKey: CacheKey) => {
    // This cache is always shared across build (the build id is not used)
    const { baseKey } = cacheKey; 
    const fileData = await fs.readFile(getCacheKey(baseKey), "utf-8");
    const data = JSON.parse(fileData);
    const { mtime } = await fs.stat(getCacheKey(baseKey));
    return {
      value: data,
      lastModified: mtime.getTime(),
    };
  },
  set: async ({ baseKey }, value) => {
    const data = JSON.stringify(value);
    const cacheKey = getCacheKey(baseKey);
    // We need to create the directory before writing the file
    await fs.mkdir(path.dirname(cacheKey), { recursive: true });
    await fs.writeFile(cacheKey, data);
  },
  delete: async ({ baseKey }) => {
    await fs.rm(getCacheKey(baseKey));
  },
};

export default cache;
