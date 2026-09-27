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
    where: {
      deletedAt: null,
      ...(onMapOnly ? { onMap: true } : {}),
    },
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
      deletedAt: null,
      ...(onMapOnly ? { neighborhood: { onMap: true, deletedAt: null } } : {}),
    },
    _sum: { points: true },
  });

  const teamIds = [...new Set(deposits.map((d) => d.teamId))];
  const teams = teamIds.length
    ? await prisma.team.findMany({
        where: { id: { in: teamIds }, deletedAt: null },
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

/**
 * Territory leaderboard: teams ranked by neighborhoods held, then points earned.
 */
export function territoryLeaderboard(
  standings: NeighborhoodStanding[],
  allTeams: Array<{
    id: string;
    name: string;
    emoji: string;
    color: string;
    /** Challenge points earned (tiebreaker). */
    earned?: number;
  }>,
): TeamTerritoryRow[] {
  const rows = new Map<string, TeamTerritoryRow>();
  const earnedByTeam = new Map<string, number>();
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
    earnedByTeam.set(t.id, t.earned ?? 0);
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
    return (earnedByTeam.get(b.teamId) ?? 0) - (earnedByTeam.get(a.teamId) ?? 0);
  });
}

export type ClaimSeriesPoint = { x: string; y: number };

export type ClaimSeries = {
  id: string;
  teamId: string;
  data: ClaimSeriesPoint[];
};

/**
 * Replay deposits chronologically to build per-team neighborhoods-held over time.
 * Same claim rule as getStandings: unique strict maximum; ties = contested.
 */
export async function getClaimSeriesOverTime(opts?: {
  onMapOnly?: boolean;
  startTime?: Date;
}): Promise<ClaimSeries[]> {
  const onMapOnly = opts?.onMapOnly ?? true;

  const [teams, deposits] = await Promise.all([
    prisma.team.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, emoji: true },
      orderBy: { name: "asc" },
    }),
    prisma.neighborhoodDeposit.findMany({
      where: {
        deletedAt: null,
        ...(onMapOnly
          ? { neighborhood: { onMap: true, deletedAt: null } }
          : { neighborhood: { deletedAt: null } }),
      },
      orderBy: { createdAt: "asc" },
      select: {
        teamId: true,
        neighborhoodId: true,
        points: true,
        createdAt: true,
      },
    }),
  ]);

  // neighborhoodId -> teamId -> points
  const totals = new Map<string, Map<string, number>>();
  // neighborhoodId -> claiming teamId (or null if unclaimed/contested)
  const claimByNbh = new Map<string, string | null>();
  const heldByTeam = new Map<string, number>();
  for (const t of teams) heldByTeam.set(t.id, 0);

  const seriesData = new Map<string, ClaimSeriesPoint[]>();
  for (const t of teams) {
    const start = opts?.startTime ?? deposits[0]?.createdAt ?? new Date();
    seriesData.set(t.id, [{ x: start.toISOString(), y: 0 }]);
  }

  const claimOf = (neighborhoodId: string): string | null => {
    const byTeam = totals.get(neighborhoodId);
    if (!byTeam || byTeam.size === 0) return null;
    let topId: string | null = null;
    let topPts = -1;
    let tie = false;
    for (const [teamId, pts] of byTeam) {
      if (pts <= 0) continue;
      if (pts > topPts) {
        topPts = pts;
        topId = teamId;
        tie = false;
      } else if (pts === topPts) {
        tie = true;
      }
    }
    if (tie || topPts <= 0) return null;
    return topId;
  };

  const pushPoint = (teamId: string, at: Date, y: number) => {
    const data = seriesData.get(teamId);
    if (!data) return;
    const last = data[data.length - 1];
    if (last && last.y === y) return;
    data.push({ x: at.toISOString(), y });
  };

  for (const d of deposits) {
    if (d.points <= 0) continue;
    let byTeam = totals.get(d.neighborhoodId);
    if (!byTeam) {
      byTeam = new Map();
      totals.set(d.neighborhoodId, byTeam);
    }
    byTeam.set(d.teamId, (byTeam.get(d.teamId) ?? 0) + d.points);

    const prevClaim = claimByNbh.get(d.neighborhoodId) ?? null;
    const nextClaim = claimOf(d.neighborhoodId);
    if (prevClaim === nextClaim) continue;

    claimByNbh.set(d.neighborhoodId, nextClaim);

    if (prevClaim) {
      const next = (heldByTeam.get(prevClaim) ?? 0) - 1;
      heldByTeam.set(prevClaim, Math.max(0, next));
      pushPoint(prevClaim, d.createdAt, heldByTeam.get(prevClaim) ?? 0);
    }
    if (nextClaim) {
      heldByTeam.set(nextClaim, (heldByTeam.get(nextClaim) ?? 0) + 1);
      pushPoint(nextClaim, d.createdAt, heldByTeam.get(nextClaim) ?? 0);
    }
  }

  return teams.map((t) => ({
    id: `${t.emoji} ${t.name}`,
    teamId: t.id,
    data: seriesData.get(t.id) ?? [{ x: new Date().toISOString(), y: 0 }],
  }));
}
