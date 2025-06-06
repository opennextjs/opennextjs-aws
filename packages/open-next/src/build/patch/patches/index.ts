export { envVarRuleCreator, patchEnvVars } from "./patchEnvVar.js";
export { patchNextServer } from "./patchNextServer.js";
export {
  patchFetchCacheForISR,
  patchUnstableCacheForISR,
  patchUseCacheForISR,
} from "./patchFetchCacheISR.js";
export { patchFetchCacheSetMissingWaitUntil } from "./patchFetchCacheWaitUntil.js";
export { patchBackgroundRevalidation } from "./patchBackgroundRevalidation.js";
export { patchDropBabel } from "./dropBabel.js";
