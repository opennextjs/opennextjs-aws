import type { NextModeTagCache } from "types/overrides";
import { debug } from "../../adapters/logger";

const tagsMap = new Map<
  string,
  { revalidatedAt: number; stale?: number; expire?: number }
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
      if (typeof tagData.expire === "number") {
        const isExpired =
          tagData.expire <= now && tagData.expire > (lastModified ?? 0);
        return isExpired;
      }

      // Check if tag has been revalidated
      return tagData.revalidatedAt > (lastModified ?? 0);
    });

    debug("hasBeenRevalidated result:", hasRevalidatedTag);
    return hasRevalidatedTag;
  },
  isStale: async (tags: string[], lastModified?: number) => {
    if (globalThis.openNextConfig.dangerous?.disableTagCache) {
      return false;
    }
    const hasStaleTag = tags.some((tag) => {
      const tagData = tagsMap.get(tag);
      if (!tagData || typeof tagData.stale !== "number") {
        return false;
      }
      // A tag is stale when both its stale timestamp and its revalidatedAt are newer than the page.
      // revalidatedAt > lastModified ensures the revalidation that set this stale window happened
      // after the page was generated, preventing a stale signal from a previous ISR cycle.
      return (
        tagData.revalidatedAt > (lastModified ?? 0) &&
        tagData.stale >= (lastModified ?? 0)
      );
    });
    debug("isStale result:", hasStaleTag);
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
      const expire = typeof tag === "string" ? undefined : tag.expire;
      tagsMap.set(tagStr, {
        revalidatedAt: Date.now(),
        stale,
        expire,
      });
    });

    debug("writeTags completed, written", tags.length, "tags");
  },
} satisfies NextModeTagCache;
