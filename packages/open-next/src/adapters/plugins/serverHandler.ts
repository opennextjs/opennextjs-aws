import type { Options, PluginHandler } from "../next-types.js";
import type { IncomingMessage } from "../request.js";
import type { ServerResponse } from "../response.js";
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
