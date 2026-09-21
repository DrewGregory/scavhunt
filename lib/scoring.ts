import { prisma } from "./prisma";

/** Sum of challenge.pts over accepted submissions for a team. */
export async function getEarnedPoints(teamId: string): Promise<number> {
  const accepted = await prisma.submission.findMany({
    where: { teamId, accepted: true },
    select: { challenge: { select: { pts: true } } },
  });
  return accepted.reduce((sum, s) => sum + s.challenge.pts, 0);
}

/** Sum of non-voided neighborhood deposits for a team. */
export async function getDepositedPoints(teamId: string): Promise<number> {
  const agg = await prisma.neighborhoodDeposit.aggregate({
    where: { teamId, voidedAt: null },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

/**
 * A team's score *is* its spendable bank: earned - deposited.
 * Total earned is a derived metric used by the cumulative chart.
 */
export async function getTeamScore(teamId: string): Promise<{
  earned: number;
  deposited: number;
  score: number;
}> {
  const [earned, deposited] = await Promise.all([
    getEarnedPoints(teamId),
    getDepositedPoints(teamId),
  ]);
  return { earned, deposited, score: earned - deposited };
}

export function scoreFromParts(earned: number, deposited: number): number {
  return earned - deposited;
}
