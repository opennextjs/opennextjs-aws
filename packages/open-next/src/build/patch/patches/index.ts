export { getEnvVarsPatch } from "./patchEnvVar.js";
export { patchNextServer } from "./patchNextServer.js";
export {
  patchFetchCacheForISR,
  patchUnstableCacheForISR,
  patchUseCacheForISR,
} from "./patchFetchCacheISR.js";
export { patchFetchCacheSetMissingWaitUntil } from "./patchFetchCacheWaitUntil.js";
export { patchBackgroundRevalidation } from "./patchBackgroundRevalidation.js";
export { patchNodeEnvironment } from "./patchNodeEnvironment.js";
export { patchOriginalNextConfig } from "./patchOriginalNextConfig.js";
export { patchPagesApiRuntimeProd } from "./patchPagesApiRuntimeProd.js";
