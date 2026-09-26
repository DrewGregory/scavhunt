import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody, serializeTeam } from "../../../lib/serialize";
import { jsonError } from "../../../lib/http";

const TEAM_COLORS = [
  "#E53E3E",
  "#DD6B20",
  "#D69E2E",
  "#38A169",
  "#319795",
  "#3182CE",
  "#5A67D8",
  "#805AD5",
  "#D53F8C",
  "#718096",
] as const;

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  emoji: z.string().trim().min(1).max(16).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "color must be a #RRGGBB hex")
    .optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const includeDeleted = req.query.includeDeleted === "1";
    const teams = await prisma.team.findMany({
      where: includeDeleted ? undefined : { deletedAt: null },
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
        submissions: {
          where: { accepted: true, deletedAt: null },
          select: { challenge: { select: { pts: true } } },
        },
        deposits: {
          where: { deletedAt: null },
          select: { points: true },
        },
      },
      orderBy: { name: "asc" },
    });
    return res.status(200).json({
      teams: teams.map((t) => {
        const earned = t.submissions.reduce(
          (sum, s) => sum + s.challenge.pts,
          0,
        );
        const deposited = t.deposits.reduce((sum, d) => sum + d.points, 0);
        const bonus = t.bonusPoints;
        return {
          ...serializeTeam(t),
          bonusPoints: bonus,
          earned,
          deposited,
          score: earned + bonus - deposited,
          users: t.users,
        };
      }),
    });
  }

  if (req.method === "PATCH") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const parsed = patchSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const { id, name, emoji, color } = parsed.data;
    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Team not found" });
    }

    const updated = await prisma.team.update({
      where: { id },
      data: {
        ...(name != null ? { name } : {}),
        ...(emoji != null ? { emoji } : {}),
        ...(color != null ? { color } : {}),
      },
    });

    return res.status(200).json({ team: serializeTeam(updated) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

export { TEAM_COLORS };
