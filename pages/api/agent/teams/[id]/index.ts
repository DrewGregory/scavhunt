import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminApiKey } from "../../../../../lib/agentAuth";
import { prisma } from "../../../../../lib/prisma";
import { parseJsonBody, serializeTeam } from "../../../../../lib/serialize";
import { getTeamScore } from "../../../../../lib/scoring";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  emoji: z.string().trim().min(1).max(16).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  /** Positive to give, negative to take — adjusts Team.bonusPoints. */
  bonusDelta: z.number().int().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "GET") {
    const team = await prisma.team.findUnique({
      where: { id },
      include: {
        users: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            phoneE164: true,
            isAdmin: true,
            isActive: true,
          },
        },
      },
    });
    if (!team) return res.status(404).json({ error: "Team not found" });
    const score = await getTeamScore(id);
    return res.status(200).json({
      team: {
        ...serializeTeam(team),
        bonusPoints: team.bonusPoints,
        deletedAt: team.deletedAt?.toISOString() ?? null,
        users: team.users,
        score,
      },
    });
  }

  if (req.method === "PATCH") {
    const parsed = patchSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Team not found" });

    const data: {
      name?: string;
      emoji?: string;
      color?: string;
      bonusPoints?: { increment: number };
    } = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.emoji !== undefined) data.emoji = parsed.data.emoji;
    if (parsed.data.color !== undefined) data.color = parsed.data.color;
    if (parsed.data.bonusDelta !== undefined && parsed.data.bonusDelta !== 0) {
      data.bonusPoints = { increment: parsed.data.bonusDelta };
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const team = await prisma.team.update({ where: { id }, data });
    const score = await getTeamScore(id);

    return res.status(200).json({
      team: {
        ...serializeTeam(team),
        bonusPoints: team.bonusPoints,
        deletedAt: team.deletedAt?.toISOString() ?? null,
        score,
      },
    });
  }

  if (req.method === "DELETE") {
    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Team not found" });
    if (existing.deletedAt) {
      return res.status(200).json({ ok: true, alreadyDeleted: true });
    }
    const team = await prisma.team.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return res.status(200).json({
      ok: true,
      team: {
        ...serializeTeam(team),
        deletedAt: team.deletedAt?.toISOString() ?? null,
      },
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
