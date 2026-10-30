---
"@opennextjs/aws": patch
---

fix: fall back to the build id when `deploymentId` is empty

Next writes an empty `deploymentId` when `experimental.runtimeServerDeploymentId` is enabled, which resulted in un-prefixed cache keys shared across deployments.

The Open Next build id is now computed by a single documented helper, `getOpenNextBuildId()`.
