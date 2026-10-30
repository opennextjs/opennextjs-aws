---
"@opennextjs/aws": patch
---

fix: use the Open Next build id for the build-time tag cache seed and fetch cache

Since Next 16.2, `.next/BUILD_ID` is a constant when `deploymentId` is set without `generateBuildId`.
The tag cache seed and the fetch cache were written with that build id while they are read with the Open Next build id at runtime, so `revalidateTag`/`revalidatePath` were no-ops for prerendered entries.
