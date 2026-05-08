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

  // Signature for the fetch Image functions have changed across Next.js versions.
  const isV15After15510 =
    compareSemver(globalThis.nextVersion, ">=", "15.5.10") &&
    compareSemver(globalThis.nextVersion, "<", "16");
  const isV16Plus = compareSemver(globalThis.nextVersion, ">=", "16");
  const isAfter1615 = compareSemver(globalThis.nextVersion, ">=", "16.1.5");
  const isAfter1625 = compareSemver(globalThis.nextVersion, ">=", "16.2.5");

  // fetchInternalImage: maximumResponseBody added in v15.5.10 and v16.2.5.
  const isNewArgsForInternalFetch = isAfter1625 || isV15After15510;

  // fetchExternalImage signature varies across Next.js versions:
  //   <=v15.5.9:       fetchExternalImage(href)
  //   v15.5.10–v15.x:  fetchExternalImage(href, maximumResponseBody)
  //   v16.0.0–v16.1.4: fetchExternalImage(href, dangerouslyAllowLocalIP)
  //   v16.1.5+:        fetchExternalImage(href, dangerouslyAllowLocalIP, maximumResponseBody)

  // The default value for maximumResponseBody is 50KB in Next code
  // https://github.com/vercel/next.js/blob/0f38c522/packages/next/src/shared/lib/image-config.ts#L164
  const maximumResponseBody =
    nextConfig.images?.maximumResponseBody || 50_000_000;

  const imageUpstream = isAbsolute
    ? // https://github.com/vercel/next.js/blob/bfe2ab4/packages/next/src/server/image-optimizer.ts#L711
      // @ts-ignore - fetchExternalImage signature varies across Next.js versions
      await (isAfter1615
        ? fetchExternalImage(href, false, maximumResponseBody)
        : isV16Plus
          ? fetchExternalImage(href, false)
          : isV15After15510
            ? fetchExternalImage(href, maximumResponseBody)
            : fetchExternalImage(href))
    : await (isNewArgsForInternalFetch
        ? fetchInternalImage(
            href,
            // @ts-expect-error - It is supposed to be an IncomingMessage object, but only the headers are used.
            { headers },
            {}, // res object is not necessary as it's not actually used.
            maximumResponseBody,
            handleRequest,
          )
        : // @ts-expect-error - fetchInternalImage signature has changed in Next.js 15.5.10 and 16.2.5
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
