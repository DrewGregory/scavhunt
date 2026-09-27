import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../lib/prisma";
import { requireApiUser } from "../../lib/auth";
import { listEnabledChallengesWithSubs } from "../../lib/challengeFavorites";
import { isTerritoryEnabled } from "../../lib/territoryGate";
import { getStandings } from "../../lib/territory";
import { getTeamScore } from "../../lib/scoring";
import { requireHuntStartedApi } from "../../lib/time";
import type { LatestTeamLocation } from "../../lib/types";

/**
 * Live map payload for polling: challenges (+ team favorites), team locations,
 * territory standings, and bank.
 */
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

  const disableTracking = process.env.NEXT_PUBLIC_DISABLE_LOCATION_TRACKING;
  let locations: LatestTeamLocation[] = [];
  if (disableTracking !== "true" && disableTracking !== "1") {
    const teamsWithLocations = await prisma.team.findMany({
      where: { deletedAt: null },
      include: {
        locations: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    locations = teamsWithLocations
      .filter((t) => t.locations.length > 0)
      .map((t) => ({
        id: t.id,
        emoji: t.emoji,
        name: t.name,
        latestLocation: {
          lat: t.locations[0]!.lat,
          lng: t.locations[0]!.lng,
          id: t.locations[0]!.id,
        },
      }));
  }

  const territoryGloballyEnabled = await isTerritoryEnabled();
  const showTerritory = territoryGloballyEnabled || user.isAdmin;
  let neighborhoods: unknown[] = [];
  let bank: unknown = null;

  if (showTerritory) {
    const standings = await getStandings({
      onMapOnly: true,
      includeBoundary: true,
    });
    neighborhoods = standings.map((s) => ({
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
    }));
    if (user.teamId) {
      bank = await getTeamScore(user.teamId);
    }
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    challenges,
    locations,
    territoryEnabled: territoryGloballyEnabled,
    neighborhoods: showTerritory ? neighborhoods : [],
    bank: showTerritory ? bank : null,
  });
}
