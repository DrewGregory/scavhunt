import { prisma } from "./prisma";

/**
 * Close the highest open tournament round (same rules as admin closeRound)
 * and open the next round of matchups. Idempotent when nothing is open.
 */
export async function closeCurrentRound(): Promise<{
  closed: boolean;
  complete: boolean;
  closedRound: number | null;
}> {
  const openMatchups = await prisma.matchup.findMany({
    where: { isOpen: true },
    include: { votes: true },
    orderBy: [{ round: "asc" }, { id: "asc" }],
  });

  if (openMatchups.length === 0) {
    return { closed: false, complete: true, closedRound: null };
  }

  const maxOpenRound = Math.max(...openMatchups.map((m) => m.round));
  const roundMatchups = openMatchups.filter((m) => m.round === maxOpenRound);

  await prisma.$transaction(async (tx) => {
    for (const matchup of roundMatchups) {
      const votesA = matchup.votes.filter(
        (v) => v.neighborhoodId === matchup.slotAId,
      ).length;
      const votesB = matchup.votes.filter(
        (v) => v.neighborhoodId === matchup.slotBId,
      ).length;
      const winnerId = votesB > votesA ? matchup.slotBId : matchup.slotAId;

      await tx.matchup.update({
        where: { id: matchup.id },
        data: { winnerId, isOpen: false },
      });
    }

    const allInRound = await tx.matchup.findMany({
      where: { round: maxOpenRound },
      orderBy: { id: "asc" },
    });

    const winners = allInRound
      .map((m) => m.winnerId)
      .filter((id): id is string => id != null);

    if (winners.length <= 1) return;

    const nextRound = maxOpenRound + 1;
    for (let i = 0; i + 1 < winners.length; i += 2) {
      await tx.matchup.create({
        data: {
          round: nextRound,
          slotAId: winners[i],
          slotBId: winners[i + 1],
          isOpen: true,
        },
      });
    }

    if (winners.length % 2 === 1) {
      const byeId = winners[winners.length - 1];
      await tx.matchup.create({
        data: {
          round: nextRound,
          slotAId: byeId,
          slotBId: byeId,
          winnerId: byeId,
          isOpen: false,
        },
      });
    }
  });

  const stillOpen = await prisma.matchup.count({ where: { isOpen: true } });
  return {
    closed: true,
    complete: stillOpen === 0,
    closedRound: maxOpenRound,
  };
}

/** If the current open round's schedule.endsAt is past, close and advance. */
export async function ensureRoundClosedIfExpired(): Promise<{
  currentRound: number | null;
  endsAt: string | null;
  autoClosed: boolean;
  complete: boolean;
}> {
  const openMatchups = await prisma.matchup.findMany({
    where: { isOpen: true },
    select: { round: true },
    orderBy: { round: "desc" },
    take: 1,
  });

  if (openMatchups.length === 0) {
    return {
      currentRound: null,
      endsAt: null,
      autoClosed: false,
      complete: (await prisma.matchup.count()) > 0,
    };
  }

  const currentRound = openMatchups[0].round;
  const schedule = await prisma.tournamentRoundSchedule.findUnique({
    where: { round: currentRound },
  });

  if (schedule && schedule.endsAt.getTime() <= Date.now()) {
    const result = await closeCurrentRound();
    const nextOpen = await prisma.matchup.findFirst({
      where: { isOpen: true },
      select: { round: true },
      orderBy: { round: "desc" },
    });
    const nextSchedule = nextOpen
      ? await prisma.tournamentRoundSchedule.findUnique({
          where: { round: nextOpen.round },
        })
      : null;
    return {
      currentRound: nextOpen?.round ?? null,
      endsAt: nextSchedule?.endsAt.toISOString() ?? null,
      autoClosed: result.closed,
      complete: result.complete,
    };
  }

  return {
    currentRound,
    endsAt: schedule?.endsAt.toISOString() ?? null,
    autoClosed: false,
    complete: false,
  };
}

export async function getRoundScheduleMap(): Promise<
  Record<number, string>
> {
  const rows = await prisma.tournamentRoundSchedule.findMany({
    orderBy: { round: "asc" },
  });
  const out: Record<number, string> = {};
  for (const row of rows) {
    out[row.round] = row.endsAt.toISOString();
  }
  return out;
}

/**
 * Pair neighborhoods into Round 1. Odd count gets a bye (auto-advance).
 * Works for any N >= 2 (16, 30, 32, …).
 */
export async function createOpeningRound(
  neighborhoodIds: string[],
): Promise<{ matchupsCreated: number; byes: number; entrants: number }> {
  if (neighborhoodIds.length < 2) {
    throw new Error("Need at least 2 neighborhoods to start a tournament");
  }

  const shuffled = [...neighborhoodIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  let matchupsCreated = 0;
  let byes = 0;

  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    await prisma.matchup.create({
      data: {
        round: 1,
        slotAId: shuffled[i],
        slotBId: shuffled[i + 1],
        isOpen: true,
      },
    });
    matchupsCreated += 1;
  }

  if (shuffled.length % 2 === 1) {
    const byeId = shuffled[shuffled.length - 1];
    await prisma.matchup.create({
      data: {
        round: 1,
        slotAId: byeId,
        slotBId: byeId,
        winnerId: byeId,
        isOpen: false,
      },
    });
    byes = 1;
  }

  return {
    matchupsCreated,
    byes,
    entrants: shuffled.length,
  };
}

/** Ensure every name exists as a Neighborhood row; returns all matching rows. */
export async function ensureNeighborhoods(
  names: readonly string[],
): Promise<Array<{ id: string; name: string }>> {
  for (const name of names) {
    await prisma.neighborhood.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }
  return prisma.neighborhood.findMany({
    where: { name: { in: [...names] } },
    orderBy: { name: "asc" },
  });
}
