import type { SerializedTeam } from "./types";

export type DepositReplayRow = {
  id: string;
  teamId: string;
  neighborhoodId: string;
  points: number;
  createdAt: Date;
};

export type DepositFeedMeta = {
  tookControl: boolean;
  displacedTeam: SerializedTeam | null;
  contested: boolean;
};

function claimOf(byTeam: Map<string, number>): string | null {
  if (byTeam.size === 0) return null;
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
}

function isContested(byTeam: Map<string, number>): boolean {
  let topPts = -1;
  let countAtTop = 0;
  for (const pts of byTeam.values()) {
    if (pts <= 0) continue;
    if (pts > topPts) {
      topPts = pts;
      countAtTop = 1;
    } else if (pts === topPts) {
      countAtTop += 1;
    }
  }
  return topPts > 0 && countAtTop > 1;
}

/** Replay deposits chronologically; annotate only ids in `targetIds`. */
export function depositFeedMetaForIds(
  allDeposits: DepositReplayRow[],
  targetIds: Set<string>,
  teams: Map<string, SerializedTeam>,
): Map<string, DepositFeedMeta> {
  const totals = new Map<string, Map<string, number>>();
  const out = new Map<string, DepositFeedMeta>();

  for (const d of allDeposits) {
    if (d.points <= 0) continue;

    let byTeam = totals.get(d.neighborhoodId);
    if (!byTeam) {
      byTeam = new Map();
      totals.set(d.neighborhoodId, byTeam);
    }

    const prevClaim = claimOf(byTeam);
    byTeam.set(d.teamId, (byTeam.get(d.teamId) ?? 0) + d.points);
    const nextClaim = claimOf(byTeam);
    const contested = isContested(byTeam);

    if (!targetIds.has(d.id)) continue;

    const tookControl =
      nextClaim === d.teamId && prevClaim !== d.teamId && !contested;
    const displacedTeam =
      tookControl && prevClaim ? (teams.get(prevClaim) ?? null) : null;

    out.set(d.id, { tookControl, displacedTeam, contested });
  }

  return out;
}
