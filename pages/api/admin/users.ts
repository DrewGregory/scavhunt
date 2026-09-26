import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import {
  assertSameOrigin,
  requireApiAdmin,
} from "../../../lib/auth";
import { normalizeEmail, normalizePhone } from "../../../lib/phone";
import { parseJsonBody } from "../../../lib/serialize";
import { jsonError } from "../../../lib/http";

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  teamId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  intent: z.enum(["playing", "browsing"]).nullable().optional(),
  teamPreferences: z.string().nullable().optional(),
  competitiveness: z.string().nullable().optional(),
  timeCommitment: z.string().nullable().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const includeDeleted = req.query.includeDeleted === "1";
    const users = await prisma.user.findMany({
      where: includeDeleted ? undefined : { deletedAt: null },
      include: {
        team: true,
        _count: {
          select: {
            submissions: true,
          },
        },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });

    return res.status(200).json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phoneE164: u.phoneE164,
        isAdmin: u.isAdmin,
        isActive: u.isActive,
        teamId: u.teamId,
        createdAt: u.createdAt.toISOString(),
        lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
        deletedAt: u.deletedAt?.toISOString() ?? null,
        intent: u.intent,
        teamPreferences: u.teamPreferences,
        competitiveness: u.competitiveness,
        timeCommitment: u.timeCommitment,
        surveyCompletedAt: u.surveyCompletedAt?.toISOString() ?? null,
        team: u.team
          ? { id: u.team.id, name: u.team.name, emoji: u.team.emoji }
          : null,
        _count: u._count,
      })),
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
      return res.status(400).json({ error: "Invalid request body" });
    }

    const {
      id,
      name,
      email,
      phone,
      teamId,
      isActive,
      isAdmin,
      intent,
      teamPreferences,
      competitiveness,
      timeCommitment,
    } = parsed.data;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }

    if (isAdmin === false && target.id === admin.id) {
      return res
        .status(400)
        .json({ error: "Cannot remove your own admin privileges" });
    }

    const data: {
      name?: string;
      email?: string;
      phoneE164?: string;
      teamId?: string | null;
      isActive?: boolean;
      isAdmin?: boolean;
      intent?: string | null;
      teamPreferences?: string | null;
      competitiveness?: string | null;
      timeCommitment?: string | null;
      surveyCompletedAt?: Date | null;
    } = {};

    if (name !== undefined) data.name = name.trim();
    if (email !== undefined) {
      const normalized = normalizeEmail(email);
      if (!normalized) {
        return res.status(400).json({ error: "Invalid email" });
      }
      data.email = normalized;
    }
    if (phone !== undefined) {
      const normalized = normalizePhone(phone);
      if (!normalized) {
        return res.status(400).json({ error: "Invalid phone number" });
      }
      data.phoneE164 = normalized;
    }
    if (teamId !== undefined) data.teamId = teamId;
    if (isActive !== undefined) data.isActive = isActive;
    if (isAdmin !== undefined) data.isAdmin = isAdmin;

    const surveyTouched =
      intent !== undefined ||
      teamPreferences !== undefined ||
      competitiveness !== undefined ||
      timeCommitment !== undefined;

    if (intent !== undefined) data.intent = intent;
    if (teamPreferences !== undefined) {
      data.teamPreferences =
        teamPreferences === null ? null : teamPreferences.trim() || null;
    }
    if (competitiveness !== undefined) {
      data.competitiveness =
        competitiveness === null ? null : competitiveness.trim() || null;
    }
    if (timeCommitment !== undefined) {
      data.timeCommitment =
        timeCommitment === null ? null : timeCommitment.trim() || null;
    }

    if (surveyTouched && !target.surveyCompletedAt) {
      const nextIntent = intent !== undefined ? intent : target.intent;
      const nextPrefs =
        teamPreferences !== undefined
          ? data.teamPreferences
          : target.teamPreferences;
      const nextCompete =
        competitiveness !== undefined
          ? data.competitiveness
          : target.competitiveness;
      const nextTime =
        timeCommitment !== undefined
          ? data.timeCommitment
          : target.timeCommitment;
      if (nextIntent || nextPrefs || nextCompete || nextTime) {
        data.surveyCompletedAt = new Date();
      }
    }

    try {
      const updated = await prisma.user.update({
        where: { id },
        data,
        include: {
          team: true,
          _count: {
            select: {
              submissions: true,
            },
          },
        },
      });

      return res.status(200).json({
        user: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          phoneE164: updated.phoneE164,
          isAdmin: updated.isAdmin,
          isActive: updated.isActive,
          teamId: updated.teamId,
          createdAt: updated.createdAt.toISOString(),
          lastSeenAt: updated.lastSeenAt?.toISOString() ?? null,
          intent: updated.intent,
          teamPreferences: updated.teamPreferences,
          competitiveness: updated.competitiveness,
          timeCommitment: updated.timeCommitment,
          surveyCompletedAt: updated.surveyCompletedAt?.toISOString() ?? null,
          team: updated.team
            ? {
                id: updated.team.id,
                name: updated.team.name,
                emoji: updated.team.emoji,
              }
            : null,
          _count: updated._count,
        },
      });
    } catch (error) {
      console.error("Failed to update user:", error);
      return res.status(500).json({ error: "Failed to update user" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
