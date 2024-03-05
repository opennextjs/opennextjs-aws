import type { IncomingMessage, ServerResponse } from "node:http";

import type { APIGatewayProxyEventHeaders } from "aws-lambda";
import type { NextConfig } from "next/dist/server/config-shared";
//#override imports
import {
  // @ts-ignore
  fetchExternalImage,
  // @ts-ignore
  fetchInternalImage,
  imageOptimizer,
} from "next/dist/server/image-optimizer";
//#endOverride
import type { NextUrlWithParsedQuery } from "next/dist/server/request-meta";

import { debug } from "../logger.js";

//#override optimizeImage
export async function optimizeImage(
  headers: APIGatewayProxyEventHeaders,
  imageParams: any,
  nextConfig: NextConfig,
  handleRequest: (
    newReq: IncomingMessage,
    newRes: ServerResponse,
    newParsedUrl?: NextUrlWithParsedQuery,
  ) => Promise<void>,
) {
  const { isAbsolute, href } = imageParams;

  const imageUpstream = isAbsolute
    ? await fetchExternalImage(href)
    : await fetchInternalImage(
        href,
        // @ts-ignore
        { headers },
        {}, // res object is not necessary as it's not actually used.
        handleRequest,
      );

  // @ts-ignore
  const result = await imageOptimizer(
    imageUpstream,
    imageParams,
    nextConfig,
    false, // not in dev mode
  );
  debug("optimized result", result);
  return result;
}
//#endOverride
