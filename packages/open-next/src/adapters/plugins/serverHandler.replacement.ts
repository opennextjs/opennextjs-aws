/*eslint-disable simple-import-sort/imports */
import type { Options, PluginHandler } from "../next-types.js";
//#override imports

import { IncomingMessage } from "../request.js";
import { ServerResponse } from "../response.js";
import { proxyRequest } from "./routing/util.js";
import { requestHandler, setNextjsPrebundledReact } from "./util.js";
//#endOverride

//#override handler
export const handler: PluginHandler = async (
  req: IncomingMessage,
  res: ServerResponse,
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
