/*eslint-disable simple-import-sort/imports */
import type { Options, PluginHandler } from "../../next-types.js";
import type { IncomingMessage } from "../../request.js";
import type { ServerResponse } from "../../response.js";
//#override imports
import { requestHandler } from "./util.js";
//#endOverride

//#override handler
export const handler: PluginHandler = async (
  req: IncomingMessage,
  res: ServerResponse,
  _: Options,
) => {
  return requestHandler(req, res);
};
//#endOverride
