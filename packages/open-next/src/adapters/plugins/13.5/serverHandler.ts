/*eslint-disable simple-import-sort/imports */
import type { Options, PluginHandler } from "../../next-types.js";
import type { IncomingMessage } from "../../http/request.js";
import type { ServerlessResponse } from "../../http/response.js";
//#override imports
//@ts-ignore
import { requestHandler } from "./util.js";
//@ts-ignore
import { proxyRequest } from "./routing/util.js";
//#endOverride

//#override handler
export const handler: PluginHandler = async (
  req: IncomingMessage,
  res: ServerlessResponse,
  options: Options,
) => {
  if (options.isExternalRewrite) {
    return proxyRequest(req, res);
  } else {
    // Next Server
    return requestHandler(req, res);
  }
};
//#endOverride
