import { SQSEvent } from "aws-lambda";
import fs from "node:fs";
import path from "node:path";
import { request } from "node:https";
import { IncomingMessage } from "node:http";
import { debug } from "./logger.js";

interface PrerenderManifest {
  preview: {
    previewModeId: string;
    previewModeSigningKey: string;
    previewModeEncryptionKey: string;
  };
}

function loadPrerenderManifest() {
  const filePath = path.join("prerender-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json) as PrerenderManifest;
}

export const handler = async (event: SQSEvent) => {
  const { preview } = loadPrerenderManifest();
  for (const record of event.Records) {
    const body = record.body;
    const data = JSON.parse(body);
    const url = data.url;
    debug(`Revalidating stale page ${url}`);

    // We fire off a GET request to the page to revalidate it
    // This will trigger the page to be re-rendered and cached in S3
    // By firing a GET request to the page, we ensure that the cache is also updated in CloudFront
    // We use the previewModeId to ensure the page is revalidated in a blocking way in lambda
    // https://github.com/vercel/next.js/blob/1088b3f682cbe411be2d1edc502f8a090e36dee4/packages/next/src/server/api-utils/node.ts#L353
    await new Promise<IncomingMessage>((resolve, reject) => {
      const req = request(
        `https://${process.env.HOST}${url}`,
        {
          method: "GET",
          headers: { "x-prerender-revalidate": preview.previewModeId },
        },
        (res) => {
          resolve(res);
        }
      );
      req.on("error", (err) => reject(err));
      req.end();
    });
    debug(`Revalidated stale page ${url}`);
  }
  return;
};
