import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { assertSameOrigin, requireApiUser } from "../../lib/auth";
import { toggleChallengeFavorite } from "../../lib/challengeFavorites";
import { jsonError } from "../../lib/http";
import { requireHuntStartedApi } from "../../lib/time";

const bodySchema = z.object({
  challengeId: z.string().min(1),
});

/** Toggle a shared team favorite for a challenge. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiUser(req, res);
  if (!user) return;
  if (!(await requireHuntStartedApi(res, user.isAdmin))) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertSameOrigin(req);
  } catch {
    return jsonError(res, "Invalid origin", 403);
  }

  if (!user.teamId) {
    return res.status(400).json({ error: "Join a team to favorite challenges" });
  }

  const parsed = bodySchema.safeParse(
    typeof req.body === "string" ? JSON.parse(req.body) : req.body,
  );
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body" });
  }

  try {
    const result = await toggleChallengeFavorite({
      teamId: user.teamId,
      challengeId: parsed.data.challengeId,
      userId: user.id,
    });
    return res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return res.status(404).json({ error: msg });
  }
}
