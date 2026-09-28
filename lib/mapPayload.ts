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
import { isLocationTrackingEnabled } from "./locationTracking";
import { getHuntSettings } from "./time";
import type { TerritoryNeighborhood } from "../components/leafletMap";

export type MapPageBank = {
  earned: number;
  deposited: number;
  bonus?: number;
  score: number;
};

/** Team row for map layer toggles (includes HQ / admin-only squads). */
export type MapFilterTeam = {
  id: string;
  name: string;
  emoji: string;
  /** True when the team has no non-admin members (HQ / organizer squad). */
  isAdminTeam: boolean;
};

export async function loadMapFilterTeams(): Promise<MapFilterTeam[]> {
  const teams = await prisma.team.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      emoji: true,
      users: {
        where: { deletedAt: null, isActive: true },
        select: { isAdmin: true },
      },
    },
    orderBy: { name: "asc" },
  });
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    isAdminTeam: t.users.length === 0 || t.users.every((u) => u.isAdmin),
  }));
}

export async function loadPlayerMapPayload(user: {
  id: string;
  teamId: string | null;
  isAdmin: boolean;
  team: Parameters<typeof serializeTeam>[0] | null;
}) {
  const challenges = await listEnabledChallengesWithSubs(user.teamId);

  let locations: LatestTeamLocation[] = [];
  if (await isLocationTrackingEnabled()) {
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

  const [teams, territoryGloballyEnabled, hunt] = await Promise.all([
    loadMapFilterTeams(),
    isTerritoryEnabled(),
    getHuntSettings(),
  ]);
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
    teams,
    team: user.team ? serializeTeam(user.team) : null,
    territoryEnabled: territoryGloballyEnabled,
    isAdmin: user.isAdmin,
    neighborhoods,
    bank: showTerritory ? bank : null,
    huntEndsAt: hunt.endsAt.toISOString(),
  };
}
