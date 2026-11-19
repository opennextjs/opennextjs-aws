import type { NextApiRequest, NextApiResponse } from "next";

type ResponseData = {
  untrustedIdentity: string | null;
  middlewareAdded: string | null;
};

/**
 * Returns middleware-adjusted headers observed by a Pages Router handler.
 *
 * @param req The request forwarded by middleware.
 * @param res The API response.
 * @return Nothing; the response is written through `res`.
 */
export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
) {
  const untrustedIdentity = req.headers["x-untrusted-identity"];
  const middlewareAdded = req.headers["x-middleware-added"];
  res.status(200).json({
    untrustedIdentity:
      untrustedIdentity == null ? null : String(untrustedIdentity),
    middlewareAdded: middlewareAdded == null ? null : String(middlewareAdded),
  });
}
