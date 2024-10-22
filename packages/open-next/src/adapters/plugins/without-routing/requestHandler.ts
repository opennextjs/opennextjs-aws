/* eslint-disable unused-imports/no-unused-vars */
import type { InternalEvent } from "types/open-next";

import type { MiddlewareOutputEvent } from "../../../core/routingHandler";
// This is available in requestHandler.ts
declare const internalEvent: InternalEvent;

//#override withRouting
const preprocessResult: MiddlewareOutputEvent = {
  internalEvent: internalEvent,
  isExternalRewrite: false,
  origin: false,
  isISR: false,
};
//#endOverride

// We need to export something otherwise when compiled in js it creates an empty export {} inside the override
export default {};
