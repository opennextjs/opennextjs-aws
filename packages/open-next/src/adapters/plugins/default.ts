import { PluginHandler, type Options } from "../next-types.js";
import { IncomingMessage } from "../request.js";
import { ServerResponse } from "../response.js";
import { requestHandler } from "../util.js";

export const handler: PluginHandler = async (req: IncomingMessage, res: ServerResponse) => {
  return requestHandler(req, res);
};
