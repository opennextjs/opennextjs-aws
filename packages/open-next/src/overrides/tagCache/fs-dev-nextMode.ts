import type { NextModeTagCache } from "types/overrides";
import { debug } from "../../adapters/logger";

const tagsMap = new Map<
  string,
  { revalidatedAt: number; stale?: number; expiry?: number }
>();

export default {
  name: "fs-dev-nextMode",
  mode: "nextMode",
  getLastRevalidated: async (tags: string[]) => {
    if (globalThis.openNextConfig.dangerous?.disableTagCache) {
      return 0;
    }

    let lastRevalidated = 0;

    tags.forEach((tag) => {
      const tagData = tagsMap.get(tag);
      if (tagData && tagData.revalidatedAt > lastRevalidated) {
        lastRevalidated = tagData.revalidatedAt;
      }
    });

    debug("getLastRevalidated result:", lastRevalidated);
    return lastRevalidated;
  },
  hasBeenRevalidated: async (tags: string[], lastModified?: number) => {
    if (globalThis.openNextConfig.dangerous?.disableTagCache) {
      return false;
    }

    const now = Date.now();
    const hasRevalidatedTag = tags.some((tag) => {
      const tagData = tagsMap.get(tag);
      if (!tagData) {
        return false;
      }
      
      // Check if tag has expired
      if (typeof tagData.expiry === 'number') {
        const isExpired = tagData.expiry <= now && tagData.expiry > (lastModified ?? 0);
        if (isExpired) {
          return true;
        }
      }
      
      // Check if tag has been revalidated
      return tagData.revalidatedAt > (lastModified ?? 0);
    });

    debug("hasBeenRevalidated result:", hasRevalidatedTag);
    return hasRevalidatedTag;
  },
  hasBeenStale: async (tags: string[], lastModified?: number) => {
    if (globalThis.openNextConfig.dangerous?.disableTagCache) {
      return false;
    }
    const hasStaleTag = tags.some((tag) => {
      const tagData = tagsMap.get(tag);
      if (!tagData || typeof tagData.stale !== "number") {
        return false;
      }
      return tagData.stale > (lastModified ?? 0);
    });
    debug("hasBeenStale result:", hasStaleTag);
    return hasStaleTag;
  },
  writeTags: async (tags) => {
    if (
      globalThis.openNextConfig.dangerous?.disableTagCache ||
      tags.length === 0
    ) {
      return;
    }

    debug("writeTags", { tags: tags });

    tags.forEach((tag) => {
      const tagStr = typeof tag === "string" ? tag : tag.tag;
      const stale = typeof tag === "string" ? undefined : tag.stale;
      const expiry = typeof tag === "string" ? undefined : tag.expiry;
      tagsMap.set(tagStr, {
        revalidatedAt: Date.now(),
        stale,
        expiry,
      });
    });

    debug("writeTags completed, written", tags.length, "tags");
  },
} satisfies NextModeTagCache;
