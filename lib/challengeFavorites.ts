import { prisma } from "./prisma";
import { serializeChallenge, serializeSubmission } from "./serialize";
import type { SerializedChallenge, SerializedSubmission } from "./types";

export type ChallengeWithSubsAndFav = SerializedChallenge & {
  submissions: SerializedSubmission[];
  favorited: boolean;
};

export async function favoritedChallengeIdsForTeam(
  teamId: string | null | undefined,
): Promise<Set<string>> {
  if (!teamId) return new Set();
  const rows = await prisma.challengeFavorite.findMany({
    where: { teamId },
    select: { challengeId: true },
  });
  return new Set(rows.map((r) => r.challengeId));
}

export async function listEnabledChallengesWithSubs(
  teamId?: string | null,
): Promise<ChallengeWithSubsAndFav[]> {
  const [challengesRaw, favIds] = await Promise.all([
    prisma.challenge.findMany({
      where: { deletedAt: null, enabled: true },
      include: {
        submissions: {
          where: { rejected: false, deletedAt: null },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    favoritedChallengeIdsForTeam(teamId),
  ]);

  return challengesRaw.map((c) => ({
    ...serializeChallenge(c),
    submissions: c.submissions.map(serializeSubmission),
    favorited: favIds.has(c.id),
  }));
}

export async function toggleChallengeFavorite(opts: {
  teamId: string;
  challengeId: string;
  userId: string;
}): Promise<{ favorited: boolean }> {
  const challenge = await prisma.challenge.findFirst({
    where: { id: opts.challengeId, deletedAt: null, enabled: true },
    select: { id: true },
  });
  if (!challenge) {
    throw new Error("Challenge not found");
  }

  const existing = await prisma.challengeFavorite.findUnique({
    where: {
      challengeId_teamId: {
        challengeId: opts.challengeId,
        teamId: opts.teamId,
      },
    },
  });

  if (existing) {
    await prisma.challengeFavorite.delete({ where: { id: existing.id } });
    return { favorited: false };
  }

  await prisma.challengeFavorite.create({
    data: {
      challengeId: opts.challengeId,
      teamId: opts.teamId,
      createdByUserId: opts.userId,
    },
  });
  return { favorited: true };
}
