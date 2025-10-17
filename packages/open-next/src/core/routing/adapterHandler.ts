import type { IncomingMessage } from "node:http";
import { AppPathRoutesManifest } from "config/index";
import type { OpenNextNodeResponse } from "http/index";
import type { ResolvedRoute, RoutingResult } from "types/open-next";

// This function will get overwritten at build time with all the routes in a switch
// This allows the cloudflare adapter to work without having to use dynamic import
async function singleRouteHandler(
  jsPath: string,
  req: IncomingMessage,
  res: OpenNextNodeResponse,
) {
  //#override dynamicImportJs
  const handler = await import(jsPath);
  //#endOverride
  if (handler?.default?.handler) {
    //TODO: should we handle case where there is more than one match? Need to check that.
    return handler.default.handler(req, res, {});
  }
}

/**
 * This function loads the necessary routes, and invoke the expected handler.
 * @param routingResult The result of the routing process, containing information about the matched route and any parameters.
 */
export async function adapterHandler(
  req: IncomingMessage,
  res: OpenNextNodeResponse,
  routingResult: RoutingResult,
) {
  // We need an inverted index on `app-path-routes-manifest.json` to get the actual path of the js file.
  // Once we have that info, we need to check `app-manifest` or `page-manifest`
  const invertedAppPathsRouteManifestMap = new Map<string, string>(
    Object.entries(AppPathRoutesManifest).map(([key, value]) => [value, key]),
  );

  //TODO: replace this at runtime with a version precompiled for the cloudflare adapter.
  const pathsToTry = routingResult.resolvedRoutes.map(async (route) => {
    // TODO(vicb): use a cached `Record<string, string>` for faster lookup
    const module = getHandler(route);
    if (!module) {
      return;
    }

    try {
      return module.handler(req, res);
      //If it doesn't throw, we are done
    } catch {
      // I'll have to run some more tests, but in theory, we should not have anything special to do here, and we should return the 500 page here.
    }
  });
}

// Body replaced at build time
function getHandler(
  route: ResolvedRoute,
):
  | undefined
  | { handler: (req: IncomingMessage, res: OpenNextNodeResponse) => void } {
  return undefined;
}
