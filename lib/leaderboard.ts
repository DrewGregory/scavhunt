import { formatISO } from "date-fns";
import { prisma } from "./prisma";
import { serializeSubmission, serializeTeam } from "./serialize";
import type { SerializedSubmission, SerializedTeam } from "./types";
import { isTerritoryEnabled } from "./territoryGate";
import {
  getClaimSeriesOverTime,
  getStandings,
  territoryLeaderboard,
  type ClaimSeries,
} from "./territory";
import { scoreFromParts } from "./scoring";
import { getEndTime, getStartTime } from "./time";

export type { ClaimSeries };

export type TeamMember = { id: string; name: string };

export type ClaimedNeighborhood = {
  id: string;
  name: string;
  emoji: string | null;
};

export type TeamWithPts = SerializedTeam & {
  submissions: SerializedSubmission[];
  members: TeamMember[];
  claimedNeighborhoods: ClaimedNeighborhood[];
  /** Leaderboard score = earned - deposited (+ bonus) */
  pts: number;
  earned: number;
  deposited: number;
  ptsArray: number[];
};

export type TerritoryRow = {
  teamId: string;
  teamName: string;
  teamEmoji: string;
  teamColor: string;
  neighborhoodsHeld: number;
  totalDeposited: number;
  /** Spendable bank (earned + bonus − deposited) for teams with no holds. */
  bankPts: number;
  members: TeamMember[];
  claimedNeighborhoods: ClaimedNeighborhood[];
};

export type LeaderboardPayload = {
  teamsSortedbyPts: TeamWithPts[];
  startTimeISO: string;
  endTimeISO: string;
  territoryEnabled: boolean;
  territoryRows: TerritoryRow[];
  /** Neighborhoods held over time (empty when territory is off). */
  claimSeries: ClaimSeries[];
};

/** Shared payload for SSR + live polling on /teams. */
export async function getLeaderboardPayload(): Promise<LeaderboardPayload> {
  const teamsRaw = await prisma.team.findMany({
    where: { deletedAt: null },
    include: {
      users: {
        where: { deletedAt: null },
        select: { id: true, name: true },
      },
      submissions: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { challenge: true },
      },
      deposits: {
        where: { deletedAt: null },
        select: { points: true },
      },
    },
  });

  const [startTime, endTime, territoryEnabled] = await Promise.all([
    getStartTime(),
    getEndTime(),
    isTerritoryEnabled(),
  ]);

  const claimedByTeam = new Map<string, ClaimedNeighborhood[]>();
  let territoryRows: TerritoryRow[] = [];
  let claimSeries: ClaimSeries[] = [];

  if (territoryEnabled) {
    const [standings, series] = await Promise.all([
      getStandings({
        onMapOnly: true,
        includeBoundary: false,
      }),
      getClaimSeriesOverTime({ onMapOnly: true, startTime }),
    ]);
    claimSeries = series;

    for (const s of standings) {
      if (!s.claimedBy) continue;
      const list = claimedByTeam.get(s.claimedBy.teamId) ?? [];
      list.push({
        id: s.neighborhoodId,
        name: s.name,
        emoji: s.emoji,
      });
      claimedByTeam.set(s.claimedBy.teamId, list);
    }

    const rows = territoryLeaderboard(
      standings,
      teamsRaw.map((t) => {
        const accepted = t.submissions.filter((s) => s.accepted);
        const earned = accepted.reduce((sum, s) => sum + s.challenge.pts, 0);
        return {
          id: t.id,
          name: t.name,
          emoji: t.emoji,
          color: t.color,
          earned,
        };
      }),
    );

    const bankByTeam = new Map<string, number>();
    for (const t of teamsRaw) {
      const accepted = t.submissions.filter((s) => s.accepted);
      const earned = accepted.reduce((sum, s) => sum + s.challenge.pts, 0);
      const deposited = t.deposits.reduce((sum, d) => sum + d.points, 0);
      bankByTeam.set(t.id, scoreFromParts(earned, deposited, t.bonusPoints));
    }

    territoryRows = rows.map((r) => ({
      teamId: r.teamId,
      teamName: r.teamName,
      teamEmoji: r.teamEmoji,
      teamColor: r.teamColor,
      neighborhoodsHeld: r.neighborhoodsHeld,
      totalDeposited: r.totalDeposited,
      bankPts: bankByTeam.get(r.teamId) ?? 0,
      members:
        teamsRaw
          .find((t) => t.id === r.teamId)
          ?.users.map((u) => ({ id: u.id, name: u.name })) ?? [],
      claimedNeighborhoods: claimedByTeam.get(r.teamId) ?? [],
    }));
  }

  const teamsWithPts: TeamWithPts[] = teamsRaw.map((t) => {
    const accepted = t.submissions.filter((s) => s.accepted);
    const ptsArray = accepted.map((s) => s.challenge.pts);
    const earned = ptsArray.reduce((sum, p) => sum + p, 0);
    const deposited = t.deposits.reduce((sum, d) => sum + d.points, 0);
    const bonus = t.bonusPoints;
    return {
      ...serializeTeam(t),
      members: t.users.map((u) => ({ id: u.id, name: u.name })),
      claimedNeighborhoods: claimedByTeam.get(t.id) ?? [],
      submissions: t.submissions.map(serializeSubmission),
      earned,
      deposited,
      pts: scoreFromParts(earned, deposited, bonus),
      ptsArray,
    };
  });

  const teamsSortedbyPts = teamsWithPts.sort((t1, t2) => t2.pts - t1.pts);

  return {
    teamsSortedbyPts,
    startTimeISO: formatISO(startTime),
    endTimeISO: formatISO(endTime),
    territoryEnabled,
    territoryRows: territoryEnabled ? territoryRows : [],
    claimSeries: territoryEnabled ? claimSeries : [],
  };
}
