import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody, serializeTeam } from "../../../lib/serialize";
import { jsonError } from "../../../lib/http";
import { TEAM_COLORS } from "../../../lib/teamColors";

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
          deletedAt: t.deletedAt?.toISOString() ?? null,
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

  if (req.method === "DELETE") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const body = (parseJsonBody(req.body) ?? {}) as { id?: string };
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return res.status(400).json({ error: "Team ID is required" });

    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Team not found" });
    if (existing.deletedAt) {
      return res.status(200).json({
        ok: true,
        alreadyDeleted: true,
        team: {
          ...serializeTeam(existing),
          deletedAt: existing.deletedAt.toISOString(),
        },
      });
    }

    const memberCount = await prisma.user.count({
      where: { teamId: id, deletedAt: null },
    });
    if (memberCount > 0) {
      return res.status(400).json({
        error:
          "Cannot delete a team that still has members. Move members to another team first.",
      });
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

  if (req.method === "POST") {
    // Restore (`deletedAt = null`) an archived team.
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const body = (parseJsonBody(req.body) ?? {}) as { id?: string };
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return res.status(400).json({ error: "Team ID is required" });

    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Team not found" });
    if (!existing.deletedAt) {
      return res.status(200).json({
        ok: true,
        alreadyActive: true,
        team: { ...serializeTeam(existing), deletedAt: null },
      });
    }

    const team = await prisma.team.update({
      where: { id },
      data: { deletedAt: null },
    });
    return res.status(200).json({
      ok: true,
      team: { ...serializeTeam(team), deletedAt: null },
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

export { TEAM_COLORS };
