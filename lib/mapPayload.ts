/**
 * Shared SSR/API helper for the player map + challenges map view.
 */
import { prisma } from "./prisma";
import { serializeTeam } from "./serialize";
import type { LatestTeamLocation } from "./types";
import { isTerritoryEnabled } from "./territoryGate";
import { getStandings } from "./territory";
import { getTeamScore } from "./scoring";
import { listEnabledChallengesWithSubs } from "./challengeFavorites";
import type { TerritoryNeighborhood } from "../components/leafletMap";

export type MapPageBank = {
  earned: number;
  deposited: number;
  bonus?: number;
  score: number;
};

export async function loadPlayerMapPayload(user: {
  id: string;
  teamId: string | null;
  isAdmin: boolean;
  team: Parameters<typeof serializeTeam>[0] | null;
}) {
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
  let bank: MapPageBank | null = null;

  let neighborhoods: TerritoryNeighborhood[] = [];
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
      boundary: s.boundary as TerritoryNeighborhood["boundary"],
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
      boundary: n.boundary as TerritoryNeighborhood["boundary"],
      totals: [],
      claimedBy: null,
      contested: false,
      totalDeposited: 0,
    }));
  }

  return {
    challenges,
    locations,
    team: user.team ? serializeTeam(user.team) : null,
    territoryEnabled: territoryGloballyEnabled,
    isAdmin: user.isAdmin,
    neighborhoods,
    bank: showTerritory ? bank : null,
  };
}
