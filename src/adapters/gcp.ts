import type { IncomingMessage, ServerResponse } from "http";
import type { OpenNextHandler } from "../types/opennext.js";

export const createGcpAdapter = (): OpenNextHandler => {
  return async (req: IncomingMessage, res: ServerResponse) => {
    // TODO: Implement GCP adapter logic
    // This will handle translating Next.js requests/responses to GCP-compatible formats
    // Handle environment variables and deployment lifecycle for GCP services
    res.statusCode = 501;
    res.end("GCP adapter not yet implemented");
  };
};