import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiUser } from "../../../lib/auth";
import { jsonError } from "../../../lib/http";
import { ensureRoundClosedIfExpired } from "../../../lib/tournament";

const bodySchema = z.object({
  matchupId: z.string().min(1),
  neighborhoodId: z.string().min(1),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertSameOrigin(req);
  } catch {
    return jsonError(res, "Invalid origin", 403);
  }

  const user = await requireApiUser(req, res);
  if (!user) return;

  if (!user.surveyCompletedAt) {
    return res.status(403).json({
      error: "Fill out the player survey before you can vote.",
      code: "SURVEY_REQUIRED",
    });
  }

  await ensureRoundClosedIfExpired();

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return jsonError(res, "Invalid body");

  const matchup = await prisma.matchup.findUnique({
    where: { id: parsed.data.matchupId },
  });
  if (!matchup) return jsonError(res, "Matchup not found", 404);
  if (!matchup.isOpen) {
    return jsonError(res, "Voting is closed for this matchup");
  }
  if (matchup.slotAId === matchup.slotBId) {
    return jsonError(res, "This matchup is a bye — no vote needed");
  }

  if (
    parsed.data.neighborhoodId !== matchup.slotAId &&
    parsed.data.neighborhoodId !== matchup.slotBId
  ) {
    return jsonError(res, "Neighborhood is not in this matchup");
  }

  const vote = await prisma.vote.upsert({
    where: {
      userId_matchupId: {
        userId: user.id,
        matchupId: matchup.id,
      },
    },
    create: {
      userId: user.id,
      matchupId: matchup.id,
      neighborhoodId: parsed.data.neighborhoodId,
    },
    update: {
      neighborhoodId: parsed.data.neighborhoodId,
    },
  });

  return res.status(200).json({ ok: true, voteId: vote.id });
}
