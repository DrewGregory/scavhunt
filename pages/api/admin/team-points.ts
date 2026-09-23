import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";
import { jsonError } from "../../../lib/http";
import { getTeamScore } from "../../../lib/scoring";

const bodySchema = z.object({
  teamId: z.string().min(1),
  /** Positive to give, negative to take. */
  delta: z.number().int().refine((n) => n !== 0, "delta must be non-zero"),
  note: z.string().trim().max(280).optional(),
});

/**
 * Admin: adjust a team's spendable bank via Team.bonusPoints.
 * POST { teamId, delta, note? }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertSameOrigin(req);
  } catch {
    return jsonError(res, "Invalid origin", 403);
  }

  const parsed = bodySchema.safeParse(parseJsonBody(req.body));
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const { teamId, delta } = parsed.data;
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    return res.status(404).json({ error: "Team not found" });
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { bonusPoints: { increment: delta } },
    select: { id: true, name: true, emoji: true, bonusPoints: true },
  });

  const score = await getTeamScore(teamId);

  return res.status(200).json({
    ok: true,
    team: updated,
    delta,
    score,
  });
}
