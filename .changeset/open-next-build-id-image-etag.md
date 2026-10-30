---
"@opennextjs/aws": patch
---

fix: use the Open Next build id for the image optimization static ETag

The ETag was computed from `.next/BUILD_ID` which is a constant when `deploymentId` is set, so it never changed across deployments.
