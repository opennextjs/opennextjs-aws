// Necessary files will be imported here with banner in esbuild

import type { RequestData } from "types/global";

type EdgeRequest = Omit<RequestData, "page">;

export default async function edgeFunctionHandler(
  request: EdgeRequest,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const routes = globalThis._ROUTES;
  let decodedPath: string | undefined;
  try {
    // Decode the complete pathname atomically so a malformed escape cannot be
    // partially decoded.
    decodedPath = decodeURIComponent(path);
  } catch {
    // A malformed pathname cannot provide a decoded route to match.
  }
  // Also match against the decoded pathname, while keeping the encoded URL in
  // the request passed to middleware.
  const correspondingRoute = routes.find((route) =>
    route.regex.some((r) => {
      const regex = new RegExp(r);
      return (
        regex.test(path) ||
        (decodedPath !== undefined && regex.test(decodedPath))
      );
    }),
  );

  if (!correspondingRoute) {
    throw new Error(`No route found for ${request.url}`);
  }

  const entry = await self._ENTRIES[`middleware_${correspondingRoute.name}`];

  const result = await entry.default({
    page: correspondingRoute.page,
    request: {
      ...request,
      page: {
        name: correspondingRoute.name,
      },
    },
  });
  globalThis.__openNextAls
    .getStore()
    ?.pendingPromiseRunner.add(result.waitUntil);
  const response = result.response;
  return response;
}
