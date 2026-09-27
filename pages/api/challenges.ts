import type { NextApiRequest, NextApiResponse } from "next";
import { requireApiUser } from "../../lib/auth";
import { listEnabledChallengesWithSubs } from "../../lib/challengeFavorites";
import { requireHuntStartedApi } from "../../lib/time";

/** Live challenges list (+ team favorite flags) for polling. */
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

  const challenges = await listEnabledChallengesWithSubs(user.teamId);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ challenges });
}
