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

/** Admin bonus (can be negative) on the team row. */
export async function getBonusPoints(teamId: string): Promise<number> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { bonusPoints: true },
  });
  return team?.bonusPoints ?? 0;
}

/**
 * A team's score *is* its spendable bank: earned + bonus - deposited.
 * Total earned is a derived metric used by the cumulative chart.
 */
export async function getTeamScore(teamId: string): Promise<{
  earned: number;
  deposited: number;
  bonus: number;
  score: number;
}> {
  const [earned, deposited, bonus] = await Promise.all([
    getEarnedPoints(teamId),
    getDepositedPoints(teamId),
    getBonusPoints(teamId),
  ]);
  return {
    earned,
    deposited,
    bonus,
    score: scoreFromParts(earned, deposited, bonus),
  };
}

export function scoreFromParts(
  earned: number,
  deposited: number,
  bonus = 0,
): number {
  return earned + bonus - deposited;
}
