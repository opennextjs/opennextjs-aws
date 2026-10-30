---
"@opennextjs/aws": patch
---

fix: use the right build id when `deploymentId` is set

Since Next 16.2, `.next/BUILD_ID` is a constant when `deploymentId` is set without `generateBuildId`.

- The build-time tag cache seed and fetch cache now use the Open Next build id, so `revalidateTag`/`revalidatePath` work for prerendered entries.
- On Next >= 16.2, the image optimization static ETag now changes on every deployment.
- The CloudFront invalidation of `/_next/data/` URLs now uses the Next build id, which is the one in the URLs.
- An empty `deploymentId` now falls back to the build id instead of producing un-prefixed cache keys.
