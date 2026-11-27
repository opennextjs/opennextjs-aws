import type { NextConfig } from "next";

export default {
  cacheComponents: true,
  // Full link prefetches can fall back to a runtime prefetch for request-dependent content.
  partialPrefetching: true,
} satisfies NextConfig;
