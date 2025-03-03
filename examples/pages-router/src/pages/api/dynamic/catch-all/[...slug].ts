import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;
  if (!Array.isArray(slug)) {
    return res.status(500).json({ error: "Invalid" });
  }
  res.status(200).json({ slug });
}
