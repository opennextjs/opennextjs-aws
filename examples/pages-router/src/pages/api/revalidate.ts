import type { NextApiRequest, NextApiResponse } from "next";

type Data =
  | { revalidated: true; path: string }
  | { revalidated: false; message: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>,
) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res
      .status(405)
      .json({ revalidated: false, message: "Method not allowed" });
  }

  const key = req.query.key;
  if (!key || typeof key !== "string") {
    return res.status(400).json({ revalidated: false, message: "Missing key" });
  }

  const path = `/revalidate/${key}`;

  await res.revalidate(path);
  return res.status(200).json({ revalidated: true, path });
}
