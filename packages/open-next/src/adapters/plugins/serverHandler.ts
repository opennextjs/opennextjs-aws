import type { IncomingMessage, OpenNextNodeResponse } from "http/index.js";
import type { Options, PluginHandler } from "types/next-types.js";

//#override imports
import { requestHandler, setNextjsPrebundledReact } from "./util.js";
//#endOverride

//TODO: refactor this, we don't need to override this anymore, we could use the replacement
// and remove setNextjsPrebundledReact where we need to
// It would be handy to change the plugin to allow delete without having to create a replacement file
//#override handler
export const handler: PluginHandler = async (
  req: IncomingMessage,
  res: OpenNextNodeResponse,
  options: Options,
) => {
  setNextjsPrebundledReact(options.internalEvent.rawPath);
  return requestHandler(req, res);
};
//#endOverride
