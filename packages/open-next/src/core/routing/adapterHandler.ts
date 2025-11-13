import type { IncomingMessage } from "node:http";
import { finished } from "node:stream/promises";
import type { OpenNextNodeResponse } from "http/index";
import type { ResolvedRoute, RoutingResult, WaitUntil } from "types/open-next";

const NEXT_REQUEST_META = Symbol.for('NextInternalRequestMeta')

/**
 * This function loads the necessary routes, and invoke the expected handler.
 * @param routingResult The result of the routing process, containing information about the matched route and any parameters.
 */
export async function adapterHandler(
  req: IncomingMessage,
  res: OpenNextNodeResponse,
  routingResult: RoutingResult,
  options: {
    waitUntil?: WaitUntil;
  } = {},
) {
  let resolved = false;
  if (routingResult.internalEvent.headers['next-resume'] === "1") {
    
    const postponed = routingResult.internalEvent.body!.toString('utf8')
    // @ts-expect-error
    req[NEXT_REQUEST_META] = {
      postponed
    }
  }

  //TODO: replace this at runtime with a version precompiled for the cloudflare adapter.
  for (const route of routingResult.resolvedRoutes) {
    const module = getHandler(route);
    if (!module || resolved) {
      return;
    }

    try {
      console.log("## adapterHandler trying route", route, req.url);
      const result = await module.handler(req, res, {
        waitUntil: options.waitUntil,
      });
      await finished(res); // Not sure this one is necessary.
      console.log("## adapterHandler route succeeded", route);
      resolved = true;
      return result;
      //If it doesn't throw, we are done
    } catch (e) {
      console.log("## adapterHandler route failed", route, e);
      // I'll have to run some more tests, but in theory, we should not have anything special to do here, and we should return the 500 page here.
    }
  }
}

// Body replaced at build time
function getHandler(route: ResolvedRoute):
  | undefined
  | {
      handler: (
        req: IncomingMessage,
        res: OpenNextNodeResponse,
        options: { waitUntil?: (promise: Promise<void>) => void },
      ) => Promise<void>;
    } {
  return undefined;
}
