import type { NextApiRequest, NextApiResponse } from "next";

// `res.send()` sets a `content-length`, `?invalid` sets a header value rejected by Node.js
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("x-value", req.query.invalid === undefined ? "ok" : "a\nb");
  res.send("body");
}
