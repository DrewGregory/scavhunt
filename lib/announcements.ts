import { prisma } from "./prisma";

export type AnnouncementViewer = {
  userId: string;
  name: string;
  email: string;
  teamId: string | null;
  teamName: string | null;
  teamEmoji: string | null;
  dismissedAt: string;
};

export type AnnouncementTeamMetric = {
  teamId: string;
  name: string;
  emoji: string;
  memberCount: number;
  seenCount: number;
  /** At least one active team member has dismissed. */
  covered: boolean;
};

export type AnnouncementMetrics = {
  activePlayerCount: number;
  seenCount: number;
  viewers: AnnouncementViewer[];
  teams: AnnouncementTeamMetric[];
  teamsCovered: number;
  teamsTotal: number;
};

export function serializeAnnouncement(row: {
  id: string;
  title: string;
  body: string;
  publishedAt: Date | null;
  pinned: boolean;
  forceShow: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdById: string | null;
}) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    pinned: row.pinned,
    forceShow: row.forceShow,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdById: row.createdById,
    status: row.deletedAt
      ? ("archived" as const)
      : row.publishedAt
        ? ("published" as const)
        : ("draft" as const),
  };
}

/** Published announcements for the announcements page. Newest first; pinned first. */
export async function listPublishedAnnouncements() {
  return prisma.announcement.findMany({
    where: {
      deletedAt: null,
      publishedAt: { not: null },
    },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
  });
}

/** At most one pinned published announcement for the feed banner. */
export async function getPinnedAnnouncement() {
  return prisma.announcement.findFirst({
    where: {
      deletedAt: null,
      publishedAt: { not: null },
      pinned: true,
    },
    orderBy: { publishedAt: "desc" },
  });
}

/** Pending force-show announcements for a user, oldest first. */
export async function listPendingAnnouncementsForUser(userId: string) {
  const dismissed = await prisma.announcementDismissal.findMany({
    where: { userId },
    select: { announcementId: true },
  });
  const dismissedIds = dismissed.map((d) => d.announcementId);

  return prisma.announcement.findMany({
    where: {
      deletedAt: null,
      publishedAt: { not: null },
      forceShow: true,
      ...(dismissedIds.length > 0 ? { id: { notIn: dismissedIds } } : {}),
    },
    orderBy: { publishedAt: "asc" },
  });
}

export async function getAnnouncementMetrics(
  announcementId: string,
): Promise<AnnouncementMetrics> {
  const [players, teams, dismissals] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, isActive: true, isAdmin: false },
      select: {
        id: true,
        name: true,
        email: true,
        teamId: true,
        team: { select: { name: true, emoji: true } },
      },
    }),
    prisma.team.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, emoji: true },
      orderBy: { name: "asc" },
    }),
    prisma.announcementDismissal.findMany({
      where: { announcementId },
      select: { userId: true, dismissedAt: true },
    }),
  ]);

  const dismissedAtByUser = new Map(
    dismissals.map((d) => [d.userId, d.dismissedAt] as const),
  );
  const seenIds = new Set(dismissals.map((d) => d.userId));
  const activePlayerCount = players.length;
  const seenPlayers = players.filter((p) => seenIds.has(p.id));
  const seenCount = seenPlayers.length;

  const viewers: AnnouncementViewer[] = seenPlayers
    .map((p) => {
      const at = dismissedAtByUser.get(p.id)!;
      return {
        userId: p.id,
        name: p.name,
        email: p.email,
        teamId: p.teamId,
        teamName: p.team?.name ?? null,
        teamEmoji: p.team?.emoji ?? null,
        dismissedAt: at.toISOString(),
      };
    })
    .sort((a, b) => b.dismissedAt.localeCompare(a.dismissedAt));

  const teamMetrics: AnnouncementTeamMetric[] = teams.map((team) => {
    const members = players.filter((p) => p.teamId === team.id);
    const seen = members.filter((m) => seenIds.has(m.id)).length;
    return {
      teamId: team.id,
      name: team.name,
      emoji: team.emoji,
      memberCount: members.length,
      seenCount: seen,
      covered: members.length > 0 && seen > 0,
    };
  });

  // Only count teams that have at least one active non-admin player.
  const withMembers = teamMetrics.filter((t) => t.memberCount > 0);

  return {
    activePlayerCount,
    seenCount,
    viewers,
    teams: teamMetrics,
    teamsCovered: withMembers.filter((t) => t.covered).length,
    teamsTotal: withMembers.length,
  };
}
