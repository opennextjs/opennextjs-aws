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

import { compareSemver } from "utils/semver.js";
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

  // Signature for the fetch Image functions have changed in Next.js 16.2.5, so we need to check the version to determine how to call them.
  const isAfter1625 = compareSemver(globalThis.nextVersion, ">=", "16.2.5");

  // The default value for maximumResponseBody is 50KB in Next code
  // https://github.com/vercel/next.js/blob/0f38c522/packages/next/src/shared/lib/image-config.ts#L164
  const maximumResponseBody =
    nextConfig.images?.maximumResponseBody || 50_000_000;

  const imageUpstream = isAbsolute
    ? // https://github.com/vercel/next.js/blob/bfe2ab4/packages/next/src/server/image-optimizer.ts#L711
      await (isAfter1625
        ? fetchExternalImage(href, false, maximumResponseBody)
        : //@ts-expect-error - fetchExternalImage signature has changed in Next.js 16, it has an extra boolean parameter.
          fetchExternalImage(href))
    : await (isAfter1625
        ? fetchInternalImage(
            href,
            // @ts-expect-error - It is supposed to be an IncomingMessage object, but only the headers are used.
            { headers },
            {}, // res object is not necessary as it's not actually used.
            handleRequest,
            maximumResponseBody,
          )
        : // @ts-expect-error - fetchInternalImage signature has changed in Next.js 16.2.5
          fetchInternalImage(
            href,
            { headers },
            {}, // res object is not necessary as it's not actually used.
            handleRequest,
          ));

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
