import type { NextApiRequest, NextApiResponse } from "next";

const SADE_SMOOTH_OPERATOR_LYRIC = `Diamond life, lover boy
He move in space with minimum waste and maximum joy
City lights and business nights
When you require streetcar desire for higher heights
No place for beginners or sensitive hearts
When sentiment is left to chance
No place to be ending but somewhere to start
No need to ask, he's a smooth operator
Smooth operator, smooth operator
Smooth operator`;

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Transfer-Encoding", "chunked");

  res.write(
    `data: ${JSON.stringify({ type: "start", model: "ai-lyric-model" })}\n\n`,
  );
  await sleep(1000);

  const lines = SADE_SMOOTH_OPERATOR_LYRIC.split("\n");
  for (const line of lines) {
    res.write(`data: ${JSON.stringify({ type: "content", body: line })}\n\n`);
    await sleep(1000);
  }

  res.write(`data: ${JSON.stringify({ type: "complete" })}\n\n`);

  res.end();
}
