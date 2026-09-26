import type { NextApiRequest, NextApiResponse } from "next";
import { requireApiUser } from "../../../lib/auth";
import { assertTerritoryEnabled } from "../../../lib/territoryGate";
import { getStandings } from "../../../lib/territory";
import { getTeamScore } from "../../../lib/scoring";
import { prisma } from "../../../lib/prisma";

/**
 * Player-facing territory payload: boundaries + standings + caller's bank.
 * 404s while territoryEnabled is false.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireApiUser(req, res);
  if (!user) return;

  if (!(await assertTerritoryEnabled(res, user))) return;

  const [standings, teams] = await Promise.all([
    getStandings({ onMapOnly: true, includeBoundary: true }),
    prisma.team.findMany({
      select: { id: true, name: true, emoji: true, color: true },
      orderBy: { name: "asc" },
    }),
  ]);

  let bank: {
    earned: number;
    deposited: number;
    score: number;
  } | null = null;
  if (user.teamId) {
    bank = await getTeamScore(user.teamId);
  }

  return res.status(200).json({
    neighborhoods: standings.map((s) => ({
      id: s.neighborhoodId,
      name: s.name,
      emoji: s.emoji,
      centerLat: s.centerLat,
      centerLng: s.centerLng,
      boundary: s.boundary,
      totals: s.totals,
      claimedBy: s.claimedBy,
      contested: s.contested,
      totalDeposited: s.totalDeposited,
    })),
    teams,
    bank,
  });
}
