import type { IncomingMessage } from "node:http";
import {
  AppPathRoutesManifest,
  AppPathsManifest,
  PagesManifest,
} from "config/index";
import type { OpenNextNodeResponse } from "http/index";
import type { RoutingResult } from "types/open-next";

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
  const pathesToTry = routingResult.resolvedRoutes.map((route) => {
    const page = route.route;
    const jsPage = invertedAppPathsRouteManifestMap.has(page)
      ? invertedAppPathsRouteManifestMap.get(page)!
      : page;
    if (route.type === "app") {
      return AppPathsManifest[jsPage];

      // biome-ignore lint/style/noUselessElse: <explanation>
    } else if (route.type === "page") {
      return PagesManifest[jsPage];
    }
    return page;
  });

  for (const p of pathesToTry) {
    try {
      //TODO: Do we need to handle monorepo path here ?
      const path = `./.next/server/${p}`;
      console.log("Trying to load handler from ", path);
      await singleRouteHandler(path, req, res);
      //If it doesn't throw, we are done
      return;
    } catch {
      // I'll have to run some more tests, but in theory, we should not have anything special to do here, and we should return the 500 page here.
    }
  }
}
