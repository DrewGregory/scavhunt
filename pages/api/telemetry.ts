import type { NextApiRequest, NextApiResponse } from "next";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertSameOrigin, getUserFromReq } from "../../lib/auth";
import { jsonError } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { parseJsonBody } from "../../lib/serialize";
import { parseUserAgent } from "../../lib/userAgent";

const MAX_INT = 2_147_483_647;
const META_MAX_BYTES = 4096;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function clampInt(n: number): number {
  const rounded = Math.round(n);
  if (rounded < 0) return 0;
  if (rounded > MAX_INT) return MAX_INT;
  return rounded;
}

const optionalClampedInt = z
  .number()
  .finite()
  .optional()
  .transform((v) => (v === undefined ? undefined : clampInt(v)));

const eventSchema = z.object({
  type: z
    .string()
    .max(64)
    .regex(/^[a-z0-9_]+$/),
  clientTs: z.number().finite().optional(),
  sessionId: z.string().min(1).max(100),
  connection: z.string().max(64).optional(),
  level: z.enum(["info", "warn", "error"]).optional(),
  attemptId: z.string().max(100).optional(),
  submissionId: z.string().max(100).optional(),
  challengeId: z.string().max(100).optional(),
  durationMs: optionalClampedInt,
  bytes: optionalClampedInt,
  originalBytes: optionalClampedInt,
  errorCode: z.string().max(64).optional(),
  errorMessage: z
    .string()
    .optional()
    .transform((v) => (v == null ? undefined : v.slice(0, 1000))),
  sandbox: z.boolean().optional(),
  meta: z.record(z.unknown()).optional(),
});

const bodySchema = z.object({
  events: z.array(eventSchema).max(50),
});

function clientIp(req: NextApiRequest): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) {
    return xf.split(",")[0]!.trim();
  }
  if (Array.isArray(xf) && xf[0]) return xf[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function allowBatch(key: string): boolean {
  const now = Date.now();
  // Opportunistic cleanup so the map does not grow without bound.
  if (rateBuckets.size > 2000) {
    for (const [k, b] of rateBuckets) {
      if (now >= b.resetAt) rateBuckets.delete(k);
    }
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count += 1;
  return true;
}

function sanitizeMeta(
  meta: Record<string, unknown> | undefined,
  clientTs: number | undefined,
): Prisma.InputJsonValue | undefined {
  const merged: Record<string, unknown> = { ...(meta ?? {}) };
  if (clientTs !== undefined) merged.clientTs = clientTs;
  if (Object.keys(merged).length === 0) return undefined;
  try {
    const serialized = JSON.stringify(merged);
    if (serialized.length > META_MAX_BYTES) return undefined;
    return merged as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertSameOrigin(req);
  } catch {
    return jsonError(res, "Invalid origin", 403);
  }

  let raw: unknown;
  try {
    raw = parseJsonBody(req.body);
  } catch {
    return jsonError(res, "Invalid JSON", 400);
  }

  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return jsonError(res, "Invalid body", 400);
  }

  const { events } = parsed.data;
  if (events.length === 0) {
    return res.status(204).end();
  }

  const sessionId = events[0]!.sessionId;
  const rateKey = `${sessionId}|${clientIp(req)}`;
  if (!allowBatch(rateKey)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  // Identity comes from the session cookie only — never trust client user ids.
  const user = await getUserFromReq(req);
  const userId = user?.id ?? null;
  const teamId = user?.teamId ?? null;

  const uaHeader = req.headers["user-agent"];
  const userAgent =
    typeof uaHeader === "string" ? uaHeader.slice(0, 500) : undefined;
  const { platform, browser } = parseUserAgent(userAgent);

  const now = new Date();
  const rows = events.map((e) => ({
    createdAt: now,
    type: e.type,
    level: e.level ?? "info",
    source: "client" as const,
    userId,
    teamId,
    submissionId: e.submissionId ?? null,
    challengeId: e.challengeId ?? null,
    sessionId: e.sessionId,
    attemptId: e.attemptId ?? null,
    durationMs: e.durationMs ?? null,
    bytes: e.bytes ?? null,
    originalBytes: e.originalBytes ?? null,
    errorCode: e.errorCode ?? null,
    errorMessage: e.errorMessage ?? null,
    platform,
    browser,
    userAgent: userAgent ?? null,
    connection: e.connection ?? null,
    sandbox: e.sandbox ?? false,
    meta: sanitizeMeta(e.meta, e.clientTs),
  }));

  try {
    await prisma.clientEvent.createMany({ data: rows });
  } catch (err) {
    console.error("telemetry createMany failed", err);
    return res.status(500).json({ error: "Failed to store events" });
  }

  // ~1% of requests: hard-delete telemetry older than 60 days.
  if (Math.random() < 0.01) {
    void prisma.clientEvent
      .deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
      })
      .catch((err) => console.error("telemetry prune failed", err));
  }

  return res.status(204).end();
}
