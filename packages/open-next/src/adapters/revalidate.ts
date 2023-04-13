import { SQSEvent } from "aws-lambda";
import fs from "node:fs";
import path from "node:path";
import { request } from "node:https";
import { IncomingMessage } from "node:http";

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
    console.log(`Revalidating stale page ${url}`);

    try {
      // We fire off a HEAD request to the page to revalidate it
      // This will trigger the page to be re-rendered and cached in S3
      // We use the previewModeId to ensure the page is revalidated in a blocking way in lambda
      // https://github.com/vercel/next.js/blob/1088b3f682cbe411be2d1edc502f8a090e36dee4/packages/next/src/server/api-utils/node.ts#L353
      await new Promise<IncomingMessage>((resolve, reject) => {
        const req = request(
          `https://${process.env.HOST}${url}`,
          {
            method: "HEAD",
            headers: { "x-prerender-revalidate": preview.previewModeId },
          },
          (res) => {
            resolve(res);
          }
        );
        req.on("error", (err) => reject(err));
        req.end();
      });
      console.log(`Revalidated stale page ${url}`);
    } catch (e) {
      console.error("Failed to revalidate stale page", url);
      console.error(e);
    }
  }
  return {
    statusCode: 200,
  };
};
