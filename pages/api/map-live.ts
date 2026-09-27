import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../lib/prisma";
import { requireApiUser, requireHuntAccessApi } from "../../lib/auth";
import { listEnabledChallengesWithSubs } from "../../lib/challengeFavorites";
import { isTerritoryEnabled } from "../../lib/territoryGate";
import { getStandings } from "../../lib/territory";
import { getTeamScore } from "../../lib/scoring";
import { loadMapFilterTeams } from "../../lib/mapPayload";
import type { LatestTeamLocation } from "../../lib/types";

/**
 * Live map payload for polling: challenges (+ team favorites), team locations,
 * territory standings / labeling neighborhoods, and bank.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiUser(req, res);
  if (!user) return;
  if (!(await requireHuntAccessApi(res, user))) return;

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
  let bank: unknown = null;

  // Always load onMap neighborhoods with boundaries so challenge drawers can
  // label neighborhoods client-side even when territory mode is off.
  let neighborhoods: unknown[] = [];
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
  } else {
    const rows = await prisma.neighborhood.findMany({
      where: { onMap: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        emoji: true,
        centerLat: true,
        centerLng: true,
        boundary: true,
      },
      orderBy: { name: "asc" },
    });
    neighborhoods = rows.map((n) => ({
      id: n.id,
      name: n.name,
      emoji: n.emoji,
      centerLat: n.centerLat,
      centerLng: n.centerLng,
      boundary: n.boundary,
      totals: [],
      claimedBy: null,
      contested: false,
      totalDeposited: 0,
    }));
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    challenges,
    locations,
    teams: await loadMapFilterTeams(),
    territoryEnabled: territoryGloballyEnabled,
    neighborhoods,
    bank: showTerritory ? bank : null,
  });
}
