import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { ensureHuntSettings, getHuntSettings } from "../../../lib/time";
import { jsonError } from "../../../lib/http";

const patchSchema = z.object({
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  territoryEnabled: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    await ensureHuntSettings();
    const settings = await getHuntSettings();
    return res.status(200).json({
      startsAt: settings.startsAt.toISOString(),
      endsAt: settings.endsAt.toISOString(),
      territoryEnabled: settings.territoryEnabled,
    });
  }

  if (req.method === "PATCH") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const parsed = patchSchema.safeParse(
      typeof req.body === "string" ? JSON.parse(req.body) : req.body,
    );
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    await ensureHuntSettings();
    const existing = await prisma.huntSettings.findUniqueOrThrow({
      where: { id: "default" },
    });

    let startsAt = existing.startsAt;
    let endsAt = existing.endsAt;
    if (parsed.data.startsAt != null) {
      startsAt = new Date(parsed.data.startsAt);
    }
    if (parsed.data.endsAt != null) {
      endsAt = new Date(parsed.data.endsAt);
    }
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return res.status(400).json({ error: "Invalid datetime" });
    }
    if (!(startsAt.getTime() < endsAt.getTime())) {
      return res.status(400).json({ error: "startsAt must be before endsAt" });
    }

    const row = await prisma.huntSettings.update({
      where: { id: "default" },
      data: {
        startsAt,
        endsAt,
        ...(parsed.data.territoryEnabled !== undefined
          ? { territoryEnabled: parsed.data.territoryEnabled }
          : {}),
      },
    });

    return res.status(200).json({
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      territoryEnabled: row.territoryEnabled,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
