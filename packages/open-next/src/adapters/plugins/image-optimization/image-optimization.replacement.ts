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

  // The default value for maximumResponseBody is 50KB in Next code
  // https://github.com/vercel/next.js/blob/0f38c522/packages/next/src/shared/lib/image-config.ts#L164
  const maximumResponseBody =
    nextConfig.images?.maximumResponseBody || 50_000_000;

  /**
   * fetchExternalImage signature varies across Next.js versions:
   *   <=v15.5.9:       fetchExternalImage(href)
   *   v15.5.10–v15.x:  fetchExternalImage(href, maximumResponseBody)
   *   v16.0.0–v16.1.4: fetchExternalImage(href, dangerouslyAllowLocalIP)
   *   v16.1.5+:        fetchExternalImage(href, dangerouslyAllowLocalIP, maximumResponseBody)
   *
   * https://github.com/vercel/next.js/blob/bfe2ab4/packages/next/src/server/image-optimizer.ts#L711
   */
  const callFetchExternalImage = () => {
    const version = globalThis.nextVersion;

    // v16.1.5+
    if (compareSemver(version, ">=", "16.1.5")) {
      return fetchExternalImage(href, false, maximumResponseBody);
    }

    // v16.0.0–v16.1.4
    if (compareSemver(version, ">=", "16")) {
      // @ts-expect-error - fetchExternalImage signature varies across Next.js versions
      return fetchExternalImage(href, false);
    }

    // v15.5.10–v15.x
    if (compareSemver(version, ">=", "15.5.10")) {
      // @ts-expect-error - fetchExternalImage signature varies across Next.js versions
      return fetchExternalImage(href, maximumResponseBody);
    }

    // <=v15.5.9
    // @ts-expect-error - fetchExternalImage signature varies across Next.js versions
    return fetchExternalImage(href);
  };

  /**
   * fetchInternalImage signature varies across Next.js versions:
   *   <=v15.5.15, v16.0.0–v16.2.4: fetchInternalImage(href, req, res, handleRequest)
   *   v15.5.16–v15.x, v16.2.5+:    fetchInternalImage(href, req, res, maximumResponseBody, handleRequest)
   */
  const callFetchInternalImage = () => {
    const version = globalThis.nextVersion;

    const isV15WithNewArgs =
      compareSemver(version, ">=", "15.5.16") &&
      compareSemver(version, "<", "16");

    // v15.5.16–v15.x, v16.2.5+
    if (isV15WithNewArgs || compareSemver(version, ">=", "16.2.5")) {
      return fetchInternalImage(
        href,
        // @ts-expect-error - It is supposed to be an IncomingMessage object, but only the headers are used.
        { headers },
        {}, // res object is not necessary as it's not actually used.
        maximumResponseBody,
        handleRequest,
      );
    }

    // <=v15.5.15, v16.0.0–v16.2.4
    // @ts-expect-error - fetchInternalImage signature has changed in Next.js 15.5.16 and 16.2.5
    return fetchInternalImage(
      href,
      { headers },
      {}, // res object is not necessary as it's not actually used.
      handleRequest,
    );
  };

  const imageUpstream = isAbsolute
    ? await callFetchExternalImage()
    : await callFetchInternalImage();

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
