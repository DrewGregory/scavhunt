import assert from "assert";
import { isValid, parseISO } from "date-fns";
import { NextApiResponse } from "next";
import { prisma } from "./prisma";

function parseEnvDate(value: string | undefined, label: string): Date {
  assert(value != null, `${label} is not set`);
  const d = parseISO(value);
  assert(isValid(d), `${label} is not a valid ISO date`);
  return d;
}

/** Hunt window from DB (HuntSettings), falling back to env for local/dev. */
export async function getHuntSettings(): Promise<{
  startsAt: Date;
  endsAt: Date;
  territoryEnabled: boolean;
}> {
  const row = await prisma.huntSettings.findUnique({
    where: { id: "default" },
  });
  if (row) {
    return {
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      territoryEnabled: row.territoryEnabled,
    };
  }

  return {
    startsAt: parseEnvDate(
      process.env.START_TIME_ISO_STRING,
      "START_TIME_ISO_STRING",
    ),
    endsAt: parseEnvDate(
      process.env.END_TIME_ISO_STRING,
      "END_TIME_ISO_STRING",
    ),
    territoryEnabled: false,
  };
}

export async function getStartTime(): Promise<Date> {
  return (await getHuntSettings()).startsAt;
}

export async function getEndTime(): Promise<Date> {
  return (await getHuntSettings()).endsAt;
}

/** Ensure singleton exists (seed from env if missing). */
export async function ensureHuntSettings(): Promise<void> {
  const existing = await prisma.huntSettings.findUnique({
    where: { id: "default" },
  });
  if (existing) return;

  const startsAt = process.env.START_TIME_ISO_STRING
    ? parseEnvDate(process.env.START_TIME_ISO_STRING, "START_TIME_ISO_STRING")
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endsAt = process.env.END_TIME_ISO_STRING
    ? parseEnvDate(process.env.END_TIME_ISO_STRING, "END_TIME_ISO_STRING")
    : new Date(startsAt.getTime() + 12 * 60 * 60 * 1000);

  await prisma.huntSettings.create({
    data: { id: "default", startsAt, endsAt },
  });
}

/** Returns a redirect object if the hunt has not started and the user is not an admin. */
export async function requireHuntStartedSSP(
  isAdmin: boolean,
): Promise<{ destination: string; permanent: false } | null> {
  if (isAdmin) return null;
  const startTime = await getStartTime();
  if (Date.now() < startTime.getTime()) {
    return { destination: "/", permanent: false };
  }
  return null;
}

/**
 * Sends a 403 response if the hunt has not started and the user is not an admin.
 * Returns true if the request should proceed.
 */
export async function requireHuntStartedApi(
  res: NextApiResponse,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  const startTime = await getStartTime();
  if (Date.now() < startTime.getTime()) {
    res.status(403).json({ error: "Hunt has not started yet" });
    return false;
  }
  return true;
}
