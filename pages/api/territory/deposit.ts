import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiUser } from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";
import { jsonError } from "../../../lib/http";
import { assertTerritoryEnabled } from "../../../lib/territoryGate";
import { findNeighborhoodAt } from "../../../lib/geo";
import { getStandings } from "../../../lib/territory";
import { getHuntSettings } from "../../../lib/time";
import { scoreFromParts } from "../../../lib/scoring";

const MAX_ACCURACY_M = 200;

const bodySchema = z.object({
  lat: z.number().min(37).max(38.5),
  lng: z.number().min(-123).max(-122),
  accuracy: z.number().positive().optional().nullable(),
  points: z.number().int().positive().max(100_000),
});

/**
 * Deposit points into the neighborhood containing the caller's GPS fix.
 * Neighborhood is resolved server-side; the client never picks it.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireApiUser(req, res);
  if (!user) return;

  if (!(await assertTerritoryEnabled(res, user))) return;

  try {
    assertSameOrigin(req);
  } catch {
    return jsonError(res, "Invalid origin", 403);
  }

  if (!user.teamId) {
    return res.status(400).json({ error: "You must be on a team to deposit", code: "NO_TEAM" });
  }

  const parsed = bodySchema.safeParse(parseJsonBody(req.body));
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const { lat, lng, points } = parsed.data;
  const accuracy = parsed.data.accuracy ?? null;

  if (accuracy != null && accuracy > MAX_ACCURACY_M) {
    return res.status(400).json({
      error: `GPS accuracy too low (${Math.round(accuracy)}m). Move outdoors and try again.`,
      code: "LOW_ACCURACY",
    });
  }

  const hunt = await getHuntSettings();
  const now = Date.now();
  if (now < hunt.startsAt.getTime() || now > hunt.endsAt.getTime()) {
    return res.status(400).json({
      error: "Deposits are only allowed during the hunt window",
      code: "HUNT_CLOSED",
    });
  }

  const candidates = await prisma.neighborhood.findMany({
    where: { onMap: true, NOT: { boundary: { equals: Prisma.DbNull } } },
    select: {
      id: true,
      name: true,
      emoji: true,
      boundary: true,
      centerLat: true,
      centerLng: true,
    },
  });

  const hit = findNeighborhoodAt(lng, lat, candidates);
  if (!hit) {
    return res.status(400).json({
      error: "You are not inside any playable neighborhood",
      code: "OUTSIDE_ANY_NEIGHBORHOOD",
    });
  }

  const teamId = user.teamId;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const accepted = await tx.submission.findMany({
        where: { teamId, accepted: true },
        select: { challenge: { select: { pts: true } } },
      });
      const earned = accepted.reduce((s, row) => s + row.challenge.pts, 0);

      const depositedAgg = await tx.neighborhoodDeposit.aggregate({
        where: { teamId, voidedAt: null },
        _sum: { points: true },
      });
      const deposited = depositedAgg._sum.points ?? 0;

      const team = await tx.team.findUnique({
        where: { id: teamId },
        select: { bonusPoints: true },
      });
      const bonus = team?.bonusPoints ?? 0;
      const score = scoreFromParts(earned, deposited, bonus);

      if (points > score) {
        const err = new Error("INSUFFICIENT_POINTS") as Error & {
          code: string;
          score: number;
        };
        err.code = "INSUFFICIENT_POINTS";
        err.score = score;
        throw err;
      }

      const deposit = await tx.neighborhoodDeposit.create({
        data: {
          teamId,
          neighborhoodId: hit.id,
          userId: user.id,
          points,
          lat,
          lng,
          accuracy,
        },
      });

      return {
        deposit,
        remainingScore: score - points,
        earned,
        deposited: deposited + points,
        bonus,
      };
    });

    const standings = await getStandings({
      onMapOnly: true,
      includeBoundary: false,
    });
    const neighborhoodStanding = standings.find(
      (s) => s.neighborhoodId === hit.id,
    );

    return res.status(200).json({
      ok: true,
      deposit: {
        id: result.deposit.id,
        points: result.deposit.points,
        neighborhoodId: hit.id,
        neighborhoodName: hit.name,
      },
      bank: {
        earned: result.earned,
        deposited: result.deposited,
        bonus: result.bonus,
        score: result.remainingScore,
      },
      neighborhood: neighborhoodStanding
        ? {
            id: neighborhoodStanding.neighborhoodId,
            name: neighborhoodStanding.name,
            totals: neighborhoodStanding.totals,
            claimedBy: neighborhoodStanding.claimedBy,
            contested: neighborhoodStanding.contested,
            totalDeposited: neighborhoodStanding.totalDeposited,
          }
        : null,
    });
  } catch (e) {
    const err = e as Error & { code?: string; score?: number };
    if (err.code === "INSUFFICIENT_POINTS") {
      return res.status(400).json({
        error: `Not enough points (you have ${err.score ?? 0})`,
        code: "INSUFFICIENT_POINTS",
        score: err.score ?? 0,
      });
    }
    throw e;
  }
}
