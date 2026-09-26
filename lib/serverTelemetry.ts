import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type ServerEventInput = {
  type: string;
  level?: "info" | "warn" | "error";
  userId?: string | null;
  teamId?: string | null;
  submissionId?: string | null;
  challengeId?: string | null;
  attemptId?: string | null;
  durationMs?: number | null;
  bytes?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  sandbox?: boolean;
  meta?: Record<string, unknown>;
};

/**
 * Structured JSON log line + ClientEvent row with source "server".
 * Never throws: telemetry must not break the request it describes.
 */
export async function logServerEvent(event: ServerEventInput): Promise<void> {
  const { meta, level = "info", sandbox = false, ...rest } = event;
  const line = { ts: new Date().toISOString(), source: "server", level, ...rest, sandbox, meta };
  const log = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  log(JSON.stringify(line));

  try {
    await prisma.clientEvent.create({
      data: {
        ...rest,
        level,
        sandbox,
        source: "server",
        meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("logServerEvent write failed", err);
  }
}

/** Reads the client's upload attempt id, sent as the `x-attempt-id` header. */
export function attemptIdFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
  const v = headers["x-attempt-id"];
  return typeof v === "string" && v.length <= 100 ? v : null;
}
