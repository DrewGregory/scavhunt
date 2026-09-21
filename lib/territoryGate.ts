import type { NextApiResponse } from "next";
import { prisma } from "./prisma";
import { ensureHuntSettings } from "./time";

/** Sole reader of HuntSettings.territoryEnabled for player-facing surfaces. */
export async function isTerritoryEnabled(): Promise<boolean> {
  await ensureHuntSettings();
  const row = await prisma.huntSettings.findUnique({
    where: { id: "default" },
    select: { territoryEnabled: true },
  });
  return row?.territoryEnabled === true;
}

/**
 * 404 (not 403) when territory is off so the endpoint does not advertise itself.
 * Returns true if enabled; otherwise has already written the response.
 */
export async function assertTerritoryEnabled(
  res: NextApiResponse,
): Promise<boolean> {
  if (await isTerritoryEnabled()) return true;
  res.status(404).json({ error: "Not found" });
  return false;
}
