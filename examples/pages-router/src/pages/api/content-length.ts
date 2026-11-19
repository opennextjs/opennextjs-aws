import type { NextApiRequest, NextApiResponse } from "next";

const body = "the full body of the response";

// `?stale` mimics a `fetch()` response from a compressed upstream returned unchanged:
// the body is decoded but `content-length` is still the compressed size.
// Next.js removes the framing headers of route handler responses, not the ones of API routes.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("content-type", "text/plain");
  res.setHeader(
    "content-length",
    req.query.stale === undefined ? String(Buffer.byteLength(body)) : "4",
  );
  res.end(body);
}
