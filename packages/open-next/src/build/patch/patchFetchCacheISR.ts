import { getCrossPlatformPathRegex } from "utils/regex.js";
import { createPatchCode } from "./astCodePatcher.js";
import type { CodePatcher } from "./codePatcher";

export const fetchRule = `
rule:
  kind: member_expression
  pattern: $WORK_STORE.isOnDemandRevalidate
  inside:
    kind: ternary_expression
    all:
      - has: {kind: 'null'}
      - has: 
          kind: await_expression
          has:
            kind: call_expression
            all:
              - has:
                  kind: member_expression
                  has:
                    kind: property_identifier
                    field: property
                    regex: get
              - has:
                  kind: arguments
                  has:
                    kind: object
                    has:
                      kind: pair
                      all:
                        - has:
                            kind: property_identifier
                            field: key
                            regex: softTags
    inside:
        kind: variable_declarator

fix:
  ($WORK_STORE.isOnDemandRevalidate && !globalThis.__openNextAls?.getStore()?.isISRRevalidation)
`;

export const unstable_cacheRule = `
rule:
  kind: member_expression
  pattern: $STORE_OR_CACHE.isOnDemandRevalidate
fix:
  ($STORE_OR_CACHE.isOnDemandRevalidate && !globalThis.__openNextAls?.getStore()?.isISRRevalidation)
`;

export const patchFetchCacheForISR: CodePatcher = {
  name: "patch-fetch-cache-for-isr",
  patches: [
    {
      versions: ">=14.0.0",
      field: {
        pathFilter: getCrossPlatformPathRegex(
          String.raw`(server/chunks/.*\.js|.*\.runtime\..*\.js|patch-fetch\.js)$`,
          { escape: false },
        ),
        contentFilter: /\.isOnDemandRevalidate/,
        patchCode: createPatchCode(fetchRule),
      },
    },
  ],
};

export const patchUnstableCacheForISR: CodePatcher = {
  name: "patch-unstable-cache-for-isr",
  patches: [
    {
      versions: ">=14.0.0",
      field: {
        pathFilter: getCrossPlatformPathRegex(
          String.raw`(spec-extension/unstable-cache\.js)$`,
          { escape: false },
        ),
        contentFilter: /\.isOnDemandRevalidate/,
        patchCode: createPatchCode(unstable_cacheRule),
      },
    },
  ],
};
