import type { NextApiRequest, NextApiResponse } from "next";
import { requireApiUser } from "../../lib/auth";
import { requireHuntStartedApi } from "../../lib/time";
import { getLeaderboardPayload } from "../../lib/leaderboard";

/** Live leaderboard payload for polling on /teams. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiUser(req, res);
  if (!user) return;
  if (!(await requireHuntStartedApi(res, user.isAdmin))) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = await getLeaderboardPayload();
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(payload);
}
