/*eslint-disable simple-import-sort/imports */
import type { Options, PluginHandler } from "../types/next-types.js";
import type { IncomingMessage } from "../http/request.js";
import type { ServerlessResponse } from "../http/response.js";
//#override imports

import { proxyRequest } from "./routing/util.js";
import { requestHandler, setNextjsPrebundledReact } from "./util.js";
//#endOverride

//#override handler
export const handler: PluginHandler = async (
  req: IncomingMessage,
  res: ServerlessResponse,
  options: Options,
) => {
  let { internalEvent } = options;

  const { rawPath } = internalEvent;

  if (options.isExternalRewrite) {
    return proxyRequest(req, res);
  } else {
    setNextjsPrebundledReact(rawPath);
    // Next Server
    return requestHandler(req, res);
  }
};
//#endOverride
