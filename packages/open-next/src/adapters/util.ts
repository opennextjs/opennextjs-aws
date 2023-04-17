import fs from "node:fs";
import path from "node:path";
import type { NextConfig, RoutesManifest } from "./next-types.js";
import type { PublicFiles } from "../build.js";
import { request } from "node:https";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { debug } from "./logger.js";

const sqsClient = new SQSClient({ region: process.env.ORIGIN_REGION });
const queueUrl = process.env.REVALIDATION_QUEUE_URL;

export function setNodeEnv() {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "production";
}

export function generateUniqueId() {
  return Math.random().toString(36).slice(2, 8);
}

export function loadConfig(nextDir: string) {
  const filePath = path.join(nextDir, "required-server-files.json");
  const json = fs.readFileSync(filePath, "utf-8");
  const { config } = JSON.parse(json);
  return config as NextConfig;
}
export function loadBuildId(nextDir: string) {
  const filePath = path.join(nextDir, "BUILD_ID");
  return fs.readFileSync(filePath, "utf-8").trim();
}

export interface PrerenderManifest {
  version: number;
  routes: {
    dataRoute: string;
    srcRoute: string | null;
    initialRevalidateSeconds: number | boolean;
  }[];
  dynamicRoutes: {
    routeRegex: string;
    dataRoute: string;
    fallback: string | null;
    dataRouteRegex: string;
  }[];
  preview: {
    previewModeId: string;
    previewModeSigningKey: string;
    previewModeEncryptionKey: string;
  };
}

export function loadPrerenderManifest(nextDir: string) {
  const filePath = path.join(nextDir, "prerender-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json) as PrerenderManifest;
}

export function loadHtmlPages(nextDir: string) {
  const filePath = path.join(nextDir, "server", "pages-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return Object.entries(JSON.parse(json))
    .filter(([_, value]) => (value as string).endsWith(".html"))
    .map(([key]) => key);
}

export function loadPublicAssets(openNextDir: string) {
  const filePath = path.join(openNextDir, "public-files.json");
  const json = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(json) as PublicFiles;
}

export function loadRoutesManifest(nextDir: string) {
  const filePath = path.join(nextDir, "routes-manifest.json");
  const json = fs.readFileSync(filePath, "utf-8");
  const routesManifest = JSON.parse(json) as RoutesManifest;
  // Static routes take precedence over dynamic routes
  return [...routesManifest.staticRoutes, ...routesManifest.dynamicRoutes];
}

export function loadAppPathsManifestKeys(nextDir: string) {
  const appPathsManifestPath = path.join(
    nextDir,
    "server",
    "app-paths-manifest.json"
  );
  const appPathsManifestJson = fs.existsSync(appPathsManifestPath)
    ? fs.readFileSync(appPathsManifestPath, "utf-8")
    : "{}";
  const appPathsManifest = JSON.parse(appPathsManifestJson) as Record<
    string,
    string
  >;
  return Object.keys(appPathsManifest).map((key) => {
    // Remove group route params and /page suffix
    const cleanedKey = key.replace(/\/\(\w+\)|\/page$/g, "");
    // We need to check if the cleaned key is empty because it means it's the root path
    return cleanedKey === "" ? "/" : cleanedKey;
  });
}

// We need to pass etag to the revalidation queue to try to bypass the default 5 min deduplication window.
// https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html
// If you need to have a revalidation happen more frequently than 5 minutes,
// your page will need to have a different etag to bypass the deduplication window.
// If data has the same etag during these 5 min dedup window, it will be deduplicated and not revalidated.
export async function revalidateInBackground(path: string, etag?: string) {
  try {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageDeduplicationId: `${path}-${etag}`,
      MessageBody: JSON.stringify({ url: path }),
      MessageGroupId: "revalidate",
    });

    await sqsClient.send(command);
  } catch (e) {
    debug(`Failed to revalidate stale page ${path}`);
    debug(e);
  }
}
