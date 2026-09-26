import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminApiKey, wantsIncludeDeleted } from "../../../../lib/agentAuth";
import { includeDeletedWhere } from "../../../../lib/softDelete";
import { prisma } from "../../../../lib/prisma";
import { normalizeEmail, normalizePhone } from "../../../../lib/phone";
import { parseJsonBody } from "../../../../lib/serialize";
import { adminEmailsFromEnv } from "../../../../lib/auth";

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

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().min(1),
  phone: z.string().min(1),
  teamId: z.string().nullable().optional(),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  if (req.method === "GET") {
    const users = await prisma.user.findMany({
      where: includeDeletedWhere(wantsIncludeDeleted(req)),
      include: {
        team: { select: { id: true, name: true, emoji: true } },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
    return res.status(200).json({ users: users.map(serializeUser) });
  }

  if (req.method === "POST") {
    const parsed = createSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const email = normalizeEmail(parsed.data.email);
    const phoneE164 = normalizePhone(parsed.data.phone);
    if (!email) return res.status(400).json({ error: "Invalid email" });
    if (!phoneE164) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    if (parsed.data.teamId) {
      const team = await prisma.team.findFirst({
        where: { id: parsed.data.teamId, deletedAt: null },
      });
      if (!team) return res.status(404).json({ error: "Team not found" });
    }

    const isAdmin =
      parsed.data.isAdmin ?? adminEmailsFromEnv().has(email);

    try {
      const user = await prisma.user.create({
        data: {
          name: parsed.data.name,
          email,
          phoneE164,
          teamId: parsed.data.teamId ?? null,
          isAdmin,
          isActive: parsed.data.isActive ?? true,
        },
        include: {
          team: { select: { id: true, name: true, emoji: true } },
        },
      });
      return res.status(201).json({ user: serializeUser(user) });
    } catch (error) {
      console.error("agent create user:", error);
      return res.status(409).json({ error: "Email or phone already in use" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
