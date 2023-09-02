import type { IncomingMessage } from "../http/request.js";
import { ServerResponse } from "../http/response.js";
import type { Options, PluginHandler } from "../next-types.js";
//#override imports
import { requestHandler, setNextjsPrebundledReact } from "./util.js";
//#endOverride

//#override handler
export const handler: PluginHandler = async (
  req: IncomingMessage,
  res: ServerResponse,
  options: Options,
) => {
  setNextjsPrebundledReact(options.internalEvent.rawPath);
  return requestHandler(req, res);
};
//#endOverride
