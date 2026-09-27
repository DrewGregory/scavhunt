import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminApiKey, wantsIncludeDeleted, optionalCreatedAtSchema } from "../../../../lib/agentAuth";
import { includeDeletedWhere } from "../../../../lib/softDelete";
import { prisma } from "../../../../lib/prisma";
import { parseJsonBody, serializeTeam } from "../../../../lib/serialize";
import { TEAM_COLORS } from "../../../../lib/teamColors";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  emoji: z.string().trim().min(1).max(16),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  /** Artificial timestamp for hunt simulation (ISO-8601). */
  createdAt: optionalCreatedAtSchema,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  if (req.method === "GET") {
    const teams = await prisma.team.findMany({
      where: includeDeletedWhere(wantsIncludeDeleted(req)),
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
          deletedAt: t.deletedAt?.toISOString() ?? null,
          users: t.users,
        };
      }),
    });
  }

  if (req.method === "POST") {
    const parsed = createSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const teamCount = await prisma.team.count({ where: { deletedAt: null } });
    const color =
      parsed.data.color ?? TEAM_COLORS[teamCount % TEAM_COLORS.length];

    const team = await prisma.team.create({
      data: {
        name: parsed.data.name,
        emoji: parsed.data.emoji,
        color,
        ...(parsed.data.createdAt
          ? { createdAt: parsed.data.createdAt }
          : {}),
      },
    });

    return res.status(201).json({
      team: {
        ...serializeTeam(team),
        bonusPoints: team.bonusPoints,
        deletedAt: null,
      },
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
