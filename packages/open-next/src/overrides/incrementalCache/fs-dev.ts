import fs from "node:fs/promises";
import path from "node:path";

import type { Extension } from "types/cache.js";
import type { IncrementalCache } from "types/overrides.js";
import { getMonorepoRelativePath } from "utils/normalize-path";

const buildId = process.env.OPEN_NEXT_BUILD_ID;
const basePath = path.join(getMonorepoRelativePath(), "cache");

/**
 * Resolves a cache entry using the same layout as the build's cache assets.
 *
 * @param key The cache entry key
 * @param cacheType The cache namespace, defaulting to the page/route cache
 * @returns The file path for the entry
 */
const getCacheKey = (key: string, cacheType: Extension = "cache") => {
  return path.join(
    basePath,
    cacheType === "fetch" ? "__fetch" : "",
    `${buildId}`,
    cacheType === "fetch" ? key : `${key}.${cacheType}`,
  );
};

const cache: IncrementalCache = {
  name: "fs-dev",
  /**
   * Reads an entry from the selected cache namespace.
   *
   * @param key The cache entry key
   * @param cacheType The cache namespace, defaulting to the page/route cache
   * @returns The cached value and its last modification time
   * @throws When the entry cannot be read or contains invalid JSON
   */
  get: async (key, cacheType) => {
    const cacheKey = getCacheKey(key, cacheType);
    const fileData = await fs.readFile(cacheKey, "utf-8");
    const data = JSON.parse(fileData);
    const { mtime } = await fs.stat(cacheKey);
    return {
      value: data,
      lastModified: mtime.getTime(),
    };
  },
  /**
   * Writes an entry to the selected cache namespace.
   *
   * @param key The cache entry key
   * @param value The value to persist
   * @param cacheType The cache namespace, defaulting to the page/route cache
   * @returns A promise that resolves when the entry has been written
   * @throws When serialization or a file system operation fails
   */
  set: async (key, value, cacheType) => {
    const data = JSON.stringify(value);
    const cacheKey = getCacheKey(key, cacheType);
    // We need to create the directory before writing the file
    await fs.mkdir(path.dirname(cacheKey), { recursive: true });
    await fs.writeFile(cacheKey, data);
  },
  delete: async (key) => {
    await fs.rm(getCacheKey(key));
  },
};

export default cache;
