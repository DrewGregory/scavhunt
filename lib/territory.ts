import { prisma } from "./prisma";

export type TeamStandingSlice = {
  teamId: string;
  teamName: string;
  teamEmoji: string;
  teamColor: string;
  points: number;
};

export type NeighborhoodStanding = {
  neighborhoodId: string;
  name: string;
  emoji: string | null;
  centerLat: number | null;
  centerLng: number | null;
  boundary: unknown;
  onMap: boolean;
  totals: TeamStandingSlice[];
  /** Strict max depositor. Null when unclaimed or contested (tie). */
  claimedBy: TeamStandingSlice | null;
  contested: boolean;
  totalDeposited: number;
};

export type TeamTerritoryRow = {
  teamId: string;
  teamName: string;
  teamEmoji: string;
  teamColor: string;
  neighborhoodsHeld: number;
  totalDeposited: number;
  heldNeighborhoodIds: string[];
};

/**
 * Aggregate non-voided deposits into per-neighborhood standings.
 * Claim rule: unique strict maximum; ties leave the neighborhood contested/unclaimed.
 */
export async function getStandings(opts?: {
  /** If true, only include neighborhoods with onMap=true (player-facing). */
  onMapOnly?: boolean;
  /** If false, omit boundary geometry (lighter payload for leaderboards). */
  includeBoundary?: boolean;
}): Promise<NeighborhoodStanding[]> {
  const onMapOnly = opts?.onMapOnly ?? true;
  const includeBoundary = opts?.includeBoundary ?? true;

  const neighborhoods = await prisma.neighborhood.findMany({
    where: onMapOnly ? { onMap: true } : undefined,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      emoji: true,
      centerLat: true,
      centerLng: true,
      boundary: includeBoundary,
      onMap: true,
    },
  });

  const deposits = await prisma.neighborhoodDeposit.groupBy({
    by: ["neighborhoodId", "teamId"],
    where: {
      voidedAt: null,
      ...(onMapOnly ? { neighborhood: { onMap: true } } : {}),
    },
    _sum: { points: true },
  });

  const teamIds = [...new Set(deposits.map((d) => d.teamId))];
  const teams = teamIds.length
    ? await prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, name: true, emoji: true, color: true },
      })
    : [];
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const byNeighborhood = new Map<string, TeamStandingSlice[]>();
  for (const d of deposits) {
    const team = teamById.get(d.teamId);
    if (!team) continue;
    const points = d._sum.points ?? 0;
    if (points <= 0) continue;
    const list = byNeighborhood.get(d.neighborhoodId) ?? [];
    list.push({
      teamId: team.id,
      teamName: team.name,
      teamEmoji: team.emoji,
      teamColor: team.color,
      points,
    });
    byNeighborhood.set(d.neighborhoodId, list);
  }

  return neighborhoods.map((n) => {
    const totals = (byNeighborhood.get(n.id) ?? []).sort(
      (a, b) => b.points - a.points,
    );
    const top = totals[0] ?? null;
    const contested =
      !!top && totals.length > 1 && totals[1].points === top.points;
    const claimedBy = top && !contested ? top : null;
    return {
      neighborhoodId: n.id,
      name: n.name,
      emoji: n.emoji,
      centerLat: n.centerLat,
      centerLng: n.centerLng,
      boundary: includeBoundary ? n.boundary : null,
      onMap: n.onMap,
      totals,
      claimedBy,
      contested,
      totalDeposited: totals.reduce((s, t) => s + t.points, 0),
    };
  });
}

/** Territory leaderboard: teams ranked by neighborhoods held, then total deposited. */
export function territoryLeaderboard(
  standings: NeighborhoodStanding[],
  allTeams: Array<{ id: string; name: string; emoji: string; color: string }>,
): TeamTerritoryRow[] {
  const rows = new Map<string, TeamTerritoryRow>();
  for (const t of allTeams) {
    rows.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      teamEmoji: t.emoji,
      teamColor: t.color,
      neighborhoodsHeld: 0,
      totalDeposited: 0,
      heldNeighborhoodIds: [],
    });
  }

  for (const s of standings) {
    for (const slice of s.totals) {
      const row = rows.get(slice.teamId);
      if (!row) continue;
      row.totalDeposited += slice.points;
    }
    if (s.claimedBy) {
      const row = rows.get(s.claimedBy.teamId);
      if (row) {
        row.neighborhoodsHeld += 1;
        row.heldNeighborhoodIds.push(s.neighborhoodId);
      }
    }
  }

  return [...rows.values()].sort((a, b) => {
    if (b.neighborhoodsHeld !== a.neighborhoodsHeld) {
      return b.neighborhoodsHeld - a.neighborhoodsHeld;
    }
    return b.totalDeposited - a.totalDeposited;
  });
}
