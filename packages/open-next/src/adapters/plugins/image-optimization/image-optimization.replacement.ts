import type { IncomingMessage, ServerResponse } from "node:http";

import type { APIGatewayProxyEventHeaders } from "aws-lambda";
import type { NextConfig } from "next/dist/server/config-shared";
//#override imports
import {
  fetchExternalImage,
  fetchInternalImage,
  imageOptimizer,
} from "next/dist/server/image-optimizer";
//#endOverride
import type { NextUrlWithParsedQuery } from "next/dist/server/request-meta";

import { debug } from "../../logger.js";

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
        // @ts-expect-error - It is supposed to be an IncomingMessage object, but only the headers are used.
        { headers },
        {}, // res object is not necessary as it's not actually used.
        handleRequest,
      );

  const result = await imageOptimizer(
    imageUpstream,
    imageParams,
    // @ts-ignore
    nextConfig,
    false, // not in dev mode
  );
  debug("optimized result", result);
  return result;
}
//#endOverride
