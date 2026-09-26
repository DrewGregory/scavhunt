import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminApiKey } from "../../../../../lib/agentAuth";
import { prisma } from "../../../../../lib/prisma";
import { normalizeEmail, normalizePhone } from "../../../../../lib/phone";
import { parseJsonBody } from "../../../../../lib/serialize";

function serializeUser(u: {
  id: string;
  name: string;
  email: string;
  phoneE164: string;
  isAdmin: boolean;
  isActive: boolean;
  teamId: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  deletedAt: Date | null;
  intent: string | null;
  teamPreferences: string | null;
  competitiveness: string | null;
  timeCommitment: string | null;
  surveyCompletedAt: Date | null;
  team?: { id: string; name: string; emoji: string } | null;
}) {
  return {
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
  };
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
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
  if (!requireAdminApiKey(req, res)) return;

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "GET") {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        team: { select: { id: true, name: true, emoji: true } },
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.status(200).json({ user: serializeUser(user) });
  }

  if (req.method === "PATCH") {
    const parsed = patchSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "User not found" });

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.email !== undefined) {
      const email = normalizeEmail(parsed.data.email);
      if (!email) return res.status(400).json({ error: "Invalid email" });
      data.email = email;
    }
    if (parsed.data.phone !== undefined) {
      const phoneE164 = normalizePhone(parsed.data.phone);
      if (!phoneE164) {
        return res.status(400).json({ error: "Invalid phone number" });
      }
      data.phoneE164 = phoneE164;
    }
    if (parsed.data.teamId !== undefined) {
      if (parsed.data.teamId) {
        const team = await prisma.team.findFirst({
          where: { id: parsed.data.teamId, deletedAt: null },
        });
        if (!team) return res.status(404).json({ error: "Team not found" });
      }
      data.teamId = parsed.data.teamId;
    }
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
    if (parsed.data.isAdmin !== undefined) data.isAdmin = parsed.data.isAdmin;
    if (parsed.data.intent !== undefined) data.intent = parsed.data.intent;
    if (parsed.data.teamPreferences !== undefined) {
      data.teamPreferences = parsed.data.teamPreferences;
    }
    if (parsed.data.competitiveness !== undefined) {
      data.competitiveness = parsed.data.competitiveness;
    }
    if (parsed.data.timeCommitment !== undefined) {
      data.timeCommitment = parsed.data.timeCommitment;
    }

    try {
      const user = await prisma.user.update({
        where: { id },
        data,
        include: {
          team: { select: { id: true, name: true, emoji: true } },
        },
      });
      return res.status(200).json({ user: serializeUser(user) });
    } catch (error) {
      console.error("agent patch user:", error);
      return res.status(409).json({ error: "Email or phone already in use" });
    }
  }

  if (req.method === "DELETE") {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "User not found" });
    if (existing.deletedAt) {
      return res.status(200).json({ ok: true, alreadyDeleted: true });
    }
    const user = await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: {
        team: { select: { id: true, name: true, emoji: true } },
      },
    });
    return res.status(200).json({ ok: true, user: serializeUser(user) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
