import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type TelemetryRange = "1h" | "6h" | "24h" | "hunt";

export type TelemetrySummaryCards = {
  uploadsStarted: number;
  uploadsDone: number;
  uploadsFailed: number;
  successRate: number | null;
  uploadP50Ms: number | null;
  uploadP90Ms: number | null;
  compressionUsedRate: number | null;
  bytesSaved: number;
  firstFrameP50Ms: number | null;
  firstFrameP90Ms: number | null;
  stallCount: number;
  lcpP75Ms: number | null;
};

export type TelemetryTimeseriesBucket = {
  bucket: string;
  started: number;
  done: number;
  failed: number;
  uploadP50Ms: number | null;
  uploadP90Ms: number | null;
  firstFrameP50Ms: number | null;
};

export type TelemetryByDevice = {
  platform: string;
  browser: string;
  uploads: number;
  successRate: number | null;
  compressionRate: number | null;
};

export type TelemetryTopFailure = {
  type: string;
  errorCode: string | null;
  count: number;
  sampleMessage: string | null;
};

export type TelemetrySummary = {
  since: string;
  range: TelemetryRange | "custom";
  includeSandbox: boolean;
  bucketMinutes: number;
  cards: TelemetrySummaryCards;
  timeseries: TelemetryTimeseriesBucket[];
  byDevice: TelemetryByDevice[];
  topFailures: TelemetryTopFailure[];
};

export type TelemetryEventRow = {
  id: string;
  createdAt: string;
  type: string;
  level: string;
  source: string;
  userId: string | null;
  teamId: string | null;
  submissionId: string | null;
  challengeId: string | null;
  sessionId: string | null;
  attemptId: string | null;
  durationMs: number | null;
  bytes: number | null;
  originalBytes: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  platform: string | null;
  browser: string | null;
  userAgent: string | null;
  connection: string | null;
  sandbox: boolean;
  meta: Prisma.JsonValue | null;
  userName: string | null;
  teamName: string | null;
  teamEmoji: string | null;
};

export type TelemetryEventsResult = {
  events: TelemetryEventRow[];
  nextCursor: string | null;
  limit: number;
};

export type TelemetryQueryParams = {
  since?: string | null;
  range?: string | null;
  includeSandbox?: boolean;
  type?: string | null;
  level?: string | null;
  userId?: string | null;
  teamId?: string | null;
  attemptId?: string | null;
  q?: string | null;
  cursor?: string | null;
  limit?: number | null;
};

function asNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function parseRange(raw: string | null | undefined): TelemetryRange | null {
  if (raw === "1h" || raw === "6h" || raw === "24h" || raw === "hunt") {
    return raw;
  }
  return null;
}

function bucketMinutesForWindow(windowMs: number): number {
  const hours = windowMs / (60 * 60 * 1000);
  if (hours <= 6) return 5;
  if (hours <= 24) return 15;
  return 60;
}

export async function resolveTelemetrySince(params: {
  since?: string | null;
  range?: string | null;
}): Promise<{ since: Date; range: TelemetryRange | "custom" }> {
  if (params.since) {
    const d = new Date(params.since);
    if (!Number.isNaN(d.getTime())) {
      return { since: d, range: "custom" };
    }
  }

  const range = parseRange(params.range) ?? "24h";
  const now = Date.now();

  if (range === "1h") {
    return { since: new Date(now - 60 * 60 * 1000), range };
  }
  if (range === "6h") {
    return { since: new Date(now - 6 * 60 * 60 * 1000), range };
  }
  if (range === "24h") {
    return { since: new Date(now - 24 * 60 * 60 * 1000), range };
  }

  try {
    const settings = await prisma.huntSettings.findUnique({
      where: { id: "default" },
      select: { startsAt: true },
    });
    if (settings?.startsAt) {
      return { since: settings.startsAt, range: "hunt" };
    }
  } catch {
    // fall through
  }
  return { since: new Date(now - 24 * 60 * 60 * 1000), range: "hunt" };
}

function sandboxClause(includeSandbox: boolean): Prisma.Sql {
  if (includeSandbox) return Prisma.sql`TRUE`;
  return Prisma.sql`"sandbox" = false`;
}

export async function getTelemetrySummary(
  params: TelemetryQueryParams,
): Promise<TelemetrySummary> {
  const includeSandbox = Boolean(params.includeSandbox);
  const { since, range } = await resolveTelemetrySince(params);
  const windowMs = Math.max(Date.now() - since.getTime(), 60 * 1000);
  const bucketMinutes = bucketMinutesForWindow(windowMs);
  const sandboxSql = sandboxClause(includeSandbox);

  type CountRow = { cnt: unknown };
  type PctRow = { p50: unknown; p90: unknown };
  type Pct75Row = { p75: unknown };
  type BytesRow = { saved: unknown };
  type CompressRow = { done: unknown; skipped: unknown; failed: unknown };
  type BucketRow = {
    bucket: Date;
    started: unknown;
    done: unknown;
    failed: unknown;
    upload_p50: unknown;
    upload_p90: unknown;
    first_frame_p50: unknown;
  };
  type DeviceRow = {
    platform: string | null;
    browser: string | null;
    uploads: unknown;
    done: unknown;
    failed: unknown;
    compress_done: unknown;
    compress_total: unknown;
  };
  type FailureRow = {
    type: string;
    error_code: string | null;
    cnt: unknown;
    sample_message: string | null;
  };

  // bucketMinutes is always 5 | 15 | 60 from our code — safe for Prisma.raw
  const bucketInterval = Prisma.raw(`'${bucketMinutes} minutes'`);

  const [
    uploadsStartedRows,
    uploadsDoneRows,
    uploadsFailedRows,
    uploadPctRows,
    compressRows,
    bytesSavedRows,
    firstFramePctRows,
    stallRows,
    lcpRows,
    timeseriesRows,
    deviceRows,
    failureRows,
  ] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS cnt
      FROM "ClientEvent"
      WHERE "createdAt" >= ${since}
        AND ${sandboxSql}
        AND "type" = 'upload_start'
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS cnt
      FROM "ClientEvent"
      WHERE "createdAt" >= ${since}
        AND ${sandboxSql}
        AND "type" = 'upload_done'
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS cnt
      FROM "ClientEvent"
      WHERE "createdAt" >= ${since}
        AND ${sandboxSql}
        AND "type" = 'upload_failed'
    `,
    prisma.$queryRaw<PctRow[]>`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") AS p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY "durationMs") AS p90
      FROM "ClientEvent"
      WHERE "createdAt" >= ${since}
        AND ${sandboxSql}
        AND "type" = 'upload_done'
        AND "durationMs" IS NOT NULL
    `,
    prisma.$queryRaw<CompressRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE "type" = 'compress_done')::bigint AS done,
        COUNT(*) FILTER (WHERE "type" = 'compress_skipped')::bigint AS skipped,
        COUNT(*) FILTER (WHERE "type" = 'compress_failed')::bigint AS failed
      FROM "ClientEvent"
      WHERE "createdAt" >= ${since}
        AND ${sandboxSql}
        AND "type" IN ('compress_done', 'compress_skipped', 'compress_failed')
    `,
    prisma.$queryRaw<BytesRow[]>`
      SELECT COALESCE(SUM(("originalBytes" - "bytes")), 0)::bigint AS saved
      FROM "ClientEvent"
      WHERE "createdAt" >= ${since}
        AND ${sandboxSql}
        AND "type" = 'compress_done'
        AND "originalBytes" IS NOT NULL
        AND "bytes" IS NOT NULL
        AND "originalBytes" >= "bytes"
    `,
    prisma.$queryRaw<PctRow[]>`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") AS p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY "durationMs") AS p90
      FROM "ClientEvent"
      WHERE "createdAt" >= ${since}
        AND ${sandboxSql}
        AND "type" = 'video_first_frame'
        AND "durationMs" IS NOT NULL
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS cnt
      FROM "ClientEvent"
      WHERE "createdAt" >= ${since}
        AND ${sandboxSql}
        AND "type" = 'video_stall'
    `,
    prisma.$queryRaw<Pct75Row[]>`
      SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY "durationMs") AS p75
      FROM "ClientEvent"
      WHERE "createdAt" >= ${since}
        AND ${sandboxSql}
        AND "type" = 'web_vital'
        AND "durationMs" IS NOT NULL
        AND ("meta"->>'name') = 'LCP'
    `,
    prisma.$queryRaw<BucketRow[]>`
      WITH buckets AS (
        SELECT
          date_bin(
            ${bucketInterval}::interval,
            "createdAt",
            TIMESTAMPTZ '1970-01-01 00:00:00+00'
          ) AS bucket,
          "type",
          "durationMs"
        FROM "ClientEvent"
        WHERE "createdAt" >= ${since}
          AND ${sandboxSql}
          AND "type" IN (
            'upload_start',
            'upload_done',
            'upload_failed',
            'video_first_frame'
          )
      )
      SELECT
        bucket,
        COUNT(*) FILTER (WHERE "type" = 'upload_start')::bigint AS started,
        COUNT(*) FILTER (WHERE "type" = 'upload_done')::bigint AS done,
        COUNT(*) FILTER (WHERE "type" = 'upload_failed')::bigint AS failed,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY CASE
            WHEN "type" = 'upload_done' THEN "durationMs"
            ELSE NULL
          END
        ) AS upload_p50,
        percentile_cont(0.9) WITHIN GROUP (
          ORDER BY CASE
            WHEN "type" = 'upload_done' THEN "durationMs"
            ELSE NULL
          END
        ) AS upload_p90,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY CASE
            WHEN "type" = 'video_first_frame' THEN "durationMs"
            ELSE NULL
          END
        ) AS first_frame_p50
      FROM buckets
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
    prisma.$queryRaw<DeviceRow[]>`
      SELECT
        COALESCE(NULLIF("platform", ''), 'unknown') AS platform,
        COALESCE(NULLIF("browser", ''), 'unknown') AS browser,
        COUNT(*) FILTER (WHERE "type" = 'upload_start')::bigint AS uploads,
        COUNT(*) FILTER (WHERE "type" = 'upload_done')::bigint AS done,
        COUNT(*) FILTER (WHERE "type" = 'upload_failed')::bigint AS failed,
        COUNT(*) FILTER (WHERE "type" = 'compress_done')::bigint AS compress_done,
        COUNT(*) FILTER (
          WHERE "type" IN ('compress_done', 'compress_skipped', 'compress_failed')
        )::bigint AS compress_total
      FROM "ClientEvent"
      WHERE "createdAt" >= ${since}
        AND ${sandboxSql}
        AND "type" IN (
          'upload_start',
          'upload_done',
          'upload_failed',
          'compress_done',
          'compress_skipped',
          'compress_failed'
        )
      GROUP BY 1, 2
      HAVING
        COUNT(*) FILTER (WHERE "type" = 'upload_start') > 0
        OR COUNT(*) FILTER (
          WHERE "type" IN ('compress_done', 'compress_skipped', 'compress_failed')
        ) > 0
      ORDER BY uploads DESC, platform ASC, browser ASC
    `,
    prisma.$queryRaw<FailureRow[]>`
      SELECT
        "type",
        "errorCode" AS error_code,
        COUNT(*)::bigint AS cnt,
        (
          ARRAY_AGG("errorMessage" ORDER BY "createdAt" DESC)
          FILTER (WHERE "errorMessage" IS NOT NULL AND "errorMessage" <> '')
        )[1] AS sample_message
      FROM "ClientEvent"
      WHERE "createdAt" >= ${since}
        AND ${sandboxSql}
        AND (
          "level" = 'error'
          OR "type" LIKE '%\\_failed' ESCAPE '\\'
          OR "type" = 'validation_failed'
          OR "type" = 'compress_skipped'
        )
      GROUP BY "type", "errorCode"
      ORDER BY cnt DESC
      LIMIT 25
    `,
  ]);

  const uploadsStarted = asNumber(uploadsStartedRows[0]?.cnt);
  const uploadsDone = asNumber(uploadsDoneRows[0]?.cnt);
  const uploadsFailed = asNumber(uploadsFailedRows[0]?.cnt);
  const compressDone = asNumber(compressRows[0]?.done);
  const compressSkipped = asNumber(compressRows[0]?.skipped);
  const compressFailed = asNumber(compressRows[0]?.failed);

  const cards: TelemetrySummaryCards = {
    uploadsStarted,
    uploadsDone,
    uploadsFailed,
    successRate: rate(uploadsDone, uploadsDone + uploadsFailed),
    uploadP50Ms: asNullableNumber(uploadPctRows[0]?.p50),
    uploadP90Ms: asNullableNumber(uploadPctRows[0]?.p90),
    compressionUsedRate: rate(
      compressDone,
      compressDone + compressSkipped + compressFailed,
    ),
    bytesSaved: asNumber(bytesSavedRows[0]?.saved),
    firstFrameP50Ms: asNullableNumber(firstFramePctRows[0]?.p50),
    firstFrameP90Ms: asNullableNumber(firstFramePctRows[0]?.p90),
    stallCount: asNumber(stallRows[0]?.cnt),
    lcpP75Ms: asNullableNumber(lcpRows[0]?.p75),
  };

  const timeseries: TelemetryTimeseriesBucket[] = timeseriesRows.map((row) => ({
    bucket: new Date(row.bucket).toISOString(),
    started: asNumber(row.started),
    done: asNumber(row.done),
    failed: asNumber(row.failed),
    uploadP50Ms: asNullableNumber(row.upload_p50),
    uploadP90Ms: asNullableNumber(row.upload_p90),
    firstFrameP50Ms: asNullableNumber(row.first_frame_p50),
  }));

  const byDevice: TelemetryByDevice[] = deviceRows.map((row) => {
    const uploads = asNumber(row.uploads);
    const done = asNumber(row.done);
    const failed = asNumber(row.failed);
    return {
      platform: row.platform ?? "unknown",
      browser: row.browser ?? "unknown",
      uploads,
      successRate: rate(done, done + failed),
      compressionRate: rate(
        asNumber(row.compress_done),
        asNumber(row.compress_total),
      ),
    };
  });

  const topFailures: TelemetryTopFailure[] = failureRows.map((row) => ({
    type: row.type,
    errorCode: row.error_code,
    count: asNumber(row.cnt),
    sampleMessage: row.sample_message,
  }));

  return {
    since: since.toISOString(),
    range,
    includeSandbox,
    bucketMinutes,
    cards,
    timeseries,
    byDevice,
    topFailures,
  };
}

export async function getTelemetryEvents(
  params: TelemetryQueryParams,
): Promise<TelemetryEventsResult> {
  const includeSandbox = Boolean(params.includeSandbox);
  const attemptId =
    typeof params.attemptId === "string" && params.attemptId.trim()
      ? params.attemptId.trim()
      : null;
  const ascending = Boolean(attemptId);

  let limit = 100;
  if (params.limit != null && Number.isFinite(params.limit)) {
    limit = Math.min(500, Math.max(1, Math.floor(params.limit)));
  }

  const { since } = await resolveTelemetrySince({
    since: params.since,
    range: params.range ?? (params.since ? null : "24h"),
  });

  const and: Prisma.ClientEventWhereInput[] = [
    { createdAt: { gte: since } },
  ];
  if (!includeSandbox) {
    and.push({ sandbox: false });
  }
  if (params.type?.trim()) {
    and.push({ type: params.type.trim() });
  }
  if (params.level?.trim()) {
    and.push({ level: params.level.trim() });
  }
  if (params.userId?.trim()) {
    and.push({ userId: params.userId.trim() });
  }
  if (params.teamId?.trim()) {
    and.push({ teamId: params.teamId.trim() });
  }
  if (attemptId) {
    and.push({ attemptId });
  }
  if (params.q?.trim()) {
    const q = params.q.trim();
    and.push({
      OR: [
        { errorMessage: { contains: q, mode: "insensitive" } },
        { type: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (params.cursor?.trim()) {
    const cursorEvent = await prisma.clientEvent.findUnique({
      where: { id: params.cursor.trim() },
      select: { id: true, createdAt: true },
    });
    if (cursorEvent) {
      if (ascending) {
        and.push({
          OR: [
            { createdAt: { gt: cursorEvent.createdAt } },
            {
              AND: [
                { createdAt: cursorEvent.createdAt },
                { id: { gt: cursorEvent.id } },
              ],
            },
          ],
        });
      } else {
        and.push({
          OR: [
            { createdAt: { lt: cursorEvent.createdAt } },
            {
              AND: [
                { createdAt: cursorEvent.createdAt },
                { id: { lt: cursorEvent.id } },
              ],
            },
          ],
        });
      }
    }
  }

  const rows = await prisma.clientEvent.findMany({
    where: { AND: and },
    orderBy: ascending
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  const userIds = [
    ...new Set(
      page.map((e) => e.userId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const teamIds = [
    ...new Set(
      page.map((e) => e.teamId).filter((id): id is string => Boolean(id)),
    ),
  ];

  const [users, teams] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    teamIds.length
      ? prisma.team.findMany({
          where: { id: { in: teamIds } },
          select: { id: true, name: true, emoji: true },
        })
      : Promise.resolve(
          [] as Array<{ id: string; name: string; emoji: string }>,
        ),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const events: TelemetryEventRow[] = page.map((e) => {
    const user = e.userId ? userById.get(e.userId) : undefined;
    const team = e.teamId ? teamById.get(e.teamId) : undefined;
    return {
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      type: e.type,
      level: e.level,
      source: e.source,
      userId: e.userId,
      teamId: e.teamId,
      submissionId: e.submissionId,
      challengeId: e.challengeId,
      sessionId: e.sessionId,
      attemptId: e.attemptId,
      durationMs: e.durationMs,
      bytes: e.bytes,
      originalBytes: e.originalBytes,
      errorCode: e.errorCode,
      errorMessage: e.errorMessage,
      platform: e.platform,
      browser: e.browser,
      userAgent: e.userAgent,
      connection: e.connection,
      sandbox: e.sandbox,
      meta: e.meta ?? null,
      userName: user?.name ?? null,
      teamName: team?.name ?? null,
      teamEmoji: team?.emoji ?? null,
    };
  });

  return { events, nextCursor, limit };
}

export function parseTelemetryQuery(
  query: Record<string, string | string[] | undefined>,
): TelemetryQueryParams {
  const one = (key: string): string | null => {
    const v = query[key];
    if (Array.isArray(v)) return v[0] ?? null;
    return typeof v === "string" ? v : null;
  };

  const limitRaw = one("limit");
  const limit = limitRaw != null && limitRaw !== "" ? Number(limitRaw) : null;

  return {
    since: one("since"),
    range: one("range"),
    includeSandbox: one("includeSandbox") === "1",
    type: one("type"),
    level: one("level"),
    userId: one("userId"),
    teamId: one("teamId"),
    attemptId: one("attemptId"),
    q: one("q"),
    cursor: one("cursor"),
    limit: Number.isFinite(limit) ? limit : null,
  };
}
