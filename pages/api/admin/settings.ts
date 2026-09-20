import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { ensureHuntSettings, getHuntSettings } from "../../../lib/time";
import { jsonError } from "../../../lib/http";

const patchSchema = z.object({
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
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

    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return res.status(400).json({ error: "Invalid datetime" });
    }
    if (!(startsAt.getTime() < endsAt.getTime())) {
      return res.status(400).json({ error: "startsAt must be before endsAt" });
    }

    const row = await prisma.huntSettings.upsert({
      where: { id: "default" },
      create: { id: "default", startsAt, endsAt },
      update: { startsAt, endsAt },
    });

    return res.status(200).json({
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
