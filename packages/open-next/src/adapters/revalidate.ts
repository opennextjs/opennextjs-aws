import fs from "node:fs";
import type { IncomingMessage } from "node:http";
import https from "node:https";
import path from "node:path";

import { createGenericHandler } from "../core/createGenericHandler.js";
import { debug, error } from "./logger.js";

const prerenderManifest = loadPrerenderManifest();

interface PrerenderManifest {
  preview: {
    previewModeId: string;
    previewModeSigningKey: string;
    previewModeEncryptionKey: string;
  };
}

export interface RevalidateEvent {
  type: "revalidate";
  records: {
    host: string;
    url: string;
    id: string;
  }[];
}

const defaultHandler = async (event: RevalidateEvent) => {
  const failedRecords: RevalidateEvent["records"] = [];
  for (const record of event.records) {
    const { host, url } = record;
    debug("Revalidating stale page", { host, url });

    // Make a HEAD request to the page to revalidate it. This will trigger
    // the page to be re-rendered and cached in S3
    // - HEAD request is used b/c it's not necessary to make a GET request
    //   and have CloudFront cache the request. This is because the request
    //   does not have real life headers and the cache won't be used anyway.
    // - "previewModeId" is used to ensure the page is revalidated in a
    //   blocking way in lambda
    //   https://github.com/vercel/next.js/blob/1088b3f682cbe411be2d1edc502f8a090e36dee4/packages/next/src/server/api-utils/node.ts#L353
    try {
      await new Promise<IncomingMessage>((resolve, reject) => {
        const req = https.request(
          `https://${host}${url}`,
          {
            method: "HEAD",
            headers: {
              "x-prerender-revalidate": prerenderManifest.preview.previewModeId,
              "x-isr": "1",
            },
          },
          (res) => {
            debug("revalidating", {
              url,
              host,
              headers: res.headers,
              statusCode: res.statusCode,
            });
            if (
              res.statusCode !== 200 ||
              res.headers["x-nextjs-cache"] !== "REVALIDATED"
            ) {
              failedRecords.push(record);
            }
            resolve(res);
          },
        );
        req.on("error", (err) => {
          error("Error revalidating page", { host, url });
          reject(err);
        });
        req.end();
      });
    } catch (err) {
      failedRecords.push(record);
    }
  }
  if (failedRecords.length > 0) {
    error(`Failed to revalidate ${failedRecords.length} pages`, {
      failedRecords,
    });
  }

  return {
    type: "revalidate",
    // Records returned here are the ones that failed to revalidate
    records: failedRecords,
  };
};

export const handler = await createGenericHandler({
  handler: defaultHandler,
  type: "revalidate",
});

function loadPrerenderManifest() {
  const filePath = path.join("prerender-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json) as PrerenderManifest;
}
