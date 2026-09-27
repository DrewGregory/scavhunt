import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { serializeSubmission, serializeTeam } from "./serialize";
import type { SerializedTeam } from "./types";
import {
  FEED_DEFAULT_LIMIT,
  FEED_MAX_LIMIT,
  VIDEO_EXTENSIONS,
  type FeedChallenge,
  type FeedFilters,
  type FeedItem,
  type FeedPage,
  type FeedStatus,
} from "./feedTypes";

type Cursor = { c: string; i: string };

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ c: createdAt.toISOString(), i: id }),
  ).toString("base64url");
}

export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof parsed?.c === "string" &&
      typeof parsed?.i === "string" &&
      !Number.isNaN(Date.parse(parsed.c))
    ) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return null;
}

function firstString(v: unknown): string | undefined {
  if (Array.isArray(v)) return firstString(v[0]);
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Parses Next.js query params into feed filters + paging. */
export function parseFeedQuery(query: Record<string, unknown>): {
  filters: FeedFilters;
  cursor: string | undefined;
  limit: number;
} {
  const status = firstString(query.status);
  const limitRaw = Number(firstString(query.limit));
  return {
    filters: {
      challengeId: firstString(query.challengeId),
      teamId: firstString(query.teamId),
      status: (["pending", "accepted", "rejected"] as const).includes(
        status as FeedStatus,
      )
        ? (status as FeedStatus)
        : undefined,
      mediaOnly: firstString(query.mediaOnly) === "1",
      videoOnly: firstString(query.videoOnly) === "1",
      favoritedOnly: firstString(query.favoritedOnly) === "1",
      q: firstString(query.q)?.slice(0, 100),
    },
    cursor: firstString(query.cursor),
    limit:
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), FEED_MAX_LIMIT)
        : FEED_DEFAULT_LIMIT,
  };
}

const baseWhere: Prisma.SubmissionWhereInput = {
  deletedAt: null,
  team: { deletedAt: null },
  challenge: { deletedAt: null, enabled: true },
};

function buildWhere(
  filters: FeedFilters,
  userId: string,
  cursor: Cursor | null,
  ids?: string[],
): Prisma.SubmissionWhereInput {
  const and: Prisma.SubmissionWhereInput[] = [baseWhere];
  if (ids) and.push({ id: { in: ids } });
  if (filters.challengeId) and.push({ challengeId: filters.challengeId });
  if (filters.teamId) and.push({ teamId: filters.teamId });
  if (filters.status === "pending") {
    and.push({ accepted: false, rejected: false });
  } else if (filters.status === "accepted") {
    and.push({ accepted: true });
  } else if (filters.status === "rejected") {
    and.push({ rejected: true });
  }
  if (filters.mediaOnly) and.push({ mediaURL: { not: null } });
  if (filters.videoOnly) {
    and.push({
      OR: VIDEO_EXTENSIONS.map((ext) => ({
        mediaURL: { endsWith: `.${ext}`, mode: "insensitive" as const },
      })),
    });
  }
  if (filters.favoritedOnly) and.push({ favorites: { some: { userId } } });
  const q = filters.q?.trim();
  if (q) {
    and.push({
      OR: [
        { team: { name: { contains: q, mode: "insensitive" } } },
        { challenge: { title: { contains: q, mode: "insensitive" } } },
        { challenge: { emoji: { contains: q } } },
      ],
    });
  }
  if (cursor) {
    const c = new Date(cursor.c);
    and.push({
      OR: [{ createdAt: { lt: c } }, { createdAt: c, id: { lt: cursor.i } }],
    });
  }
  return { AND: and };
}

type NumberRow = { id: string; num: bigint | number };
type StatsRow = {
  challengeId: string;
  accepted: number;
  pending: number;
  total: number;
};

async function submissionNumbers(
  ids: string[],
  challengeIds: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw<NumberRow[]>`
    SELECT ranked.id, ranked.num FROM (
      SELECT s.id, s.rejected,
        row_number() OVER (
          PARTITION BY s."challengeId", s.rejected
          ORDER BY s."createdAt" ASC, s.id ASC
        ) AS num
      FROM "Submission" s
      JOIN "Team" t ON t.id = s."teamId"
      WHERE s."deletedAt" IS NULL
        AND t."deletedAt" IS NULL
        AND s."challengeId" = ANY(${challengeIds})
    ) ranked
    WHERE ranked.id = ANY(${ids}) AND ranked.rejected = false
  `;
  return new Map(rows.map((r) => [r.id, Number(r.num)]));
}

async function challengeStats(
  challengeIds: string[],
): Promise<Map<string, StatsRow>> {
  if (challengeIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<StatsRow[]>`
    SELECT s."challengeId",
      (count(*) FILTER (WHERE s.accepted))::int AS accepted,
      (count(*) FILTER (WHERE NOT s.accepted AND NOT s.rejected))::int AS pending,
      count(*)::int AS total
    FROM "Submission" s
    JOIN "Team" t ON t.id = s."teamId"
    WHERE s."deletedAt" IS NULL
      AND t."deletedAt" IS NULL
      AND s."challengeId" = ANY(${challengeIds})
    GROUP BY s."challengeId"
  `;
  return new Map(rows.map((r) => [r.challengeId, r]));
}

export async function getFeedPage(opts: {
  userId: string;
  filters?: FeedFilters;
  cursor?: string | null;
  limit?: number;
  ids?: string[];
  /** When true, challenge objects include the full prompt (admin review). */
  includeChallengePrompt?: boolean;
}): Promise<FeedPage> {
  const filters = opts.filters ?? {};
  const limit = Math.min(opts.limit ?? FEED_DEFAULT_LIMIT, FEED_MAX_LIMIT);
  const cursor = decodeCursor(opts.cursor);

  const rows = await prisma.submission.findMany({
    where: buildWhere(filters, opts.userId, cursor, opts.ids),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      team: true,
      challenge: {
        select: {
          id: true,
          title: true,
          emoji: true,
          pts: true,
          numWinners: true,
          ...(opts.includeChallengePrompt ? { prompt: true } : {}),
        },
      },
      favorites: { where: { userId: opts.userId }, select: { id: true } },
      _count: { select: { favorites: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  const challengeIds = Array.from(new Set(page.map((s) => s.challengeId)));
  const [numbers, stats] = await Promise.all([
    submissionNumbers(
      page.map((s) => s.id),
      challengeIds,
    ),
    challengeStats(challengeIds),
  ]);

  const teams: Record<string, SerializedTeam> = {};
  const challenges: Record<string, FeedChallenge> = {};
  const items: FeedItem[] = page.map((s) => {
    teams[s.teamId] ??= serializeTeam(s.team);
    if (!challenges[s.challengeId]) {
      const st = stats.get(s.challengeId);
      challenges[s.challengeId] = {
        id: s.challenge.id,
        title: s.challenge.title,
        emoji: s.challenge.emoji ?? null,
        pts: s.challenge.pts,
        numWinners: s.challenge.numWinners,
        acceptedCount: st?.accepted ?? 0,
        pendingCount: st?.pending ?? 0,
        totalCount: st?.total ?? 0,
        ...(opts.includeChallengePrompt && "prompt" in s.challenge
          ? { prompt: s.challenge.prompt }
          : {}),
      };
    }
    const { team: _team, challenge: _challenge, favorites, _count, ...sub } = s;
    return {
      ...serializeSubmission(sub),
      favoriteCount: _count.favorites,
      favorited: favorites.length > 0,
      submissionNumber: s.rejected ? null : (numbers.get(s.id) ?? null),
    };
  });

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    teams,
    challenges,
  };
}
