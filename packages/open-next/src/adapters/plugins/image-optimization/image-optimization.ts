import { IncomingMessage, ServerResponse } from "node:http";

import { APIGatewayProxyEventHeaders } from "aws-lambda";
import { NextConfig } from "next/dist/server/config-shared";
//#override imports
import { imageOptimizer } from "next/dist/server/image-optimizer";
//#endOverride
import { NextUrlWithParsedQuery } from "next/dist/server/request-meta";

import { debug } from "../../logger.js";

//#override optimizeImage
export async function optimizeImage(
  headers: APIGatewayProxyEventHeaders,
  imageParams: any,
  nextConfig: NextConfig,
  handleRequest: (
    newReq: IncomingMessage,
    newRes: ServerResponse,
    newParsedUrl: NextUrlWithParsedQuery,
  ) => Promise<void>,
) {
  const result = await imageOptimizer(
    // @ts-ignore
    { headers },
    {}, // res object is not necessary as it's not actually used.
    imageParams,
    nextConfig,
    false, // not in dev mode
    // @ts-ignore
    handleRequest,
  );
  debug("optimized result", result);
  return result;
}
//#endOverride
