import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { ensureHuntSettings } from "../../../lib/time";
import { jsonError } from "../../../lib/http";
import { TEAM_COLORS } from "./teams";

/**
 * Demo teams + players for local / staging simulation.
 * Idempotent: upserts by team name and user email. Safe to click repeatedly.
 */
const DEMO_TEAMS: Array<{
  name: string;
  emoji: string;
  members: Array<{ name: string; email: string; phoneE164: string }>;
}> = [
  {
    name: "Fog Walkers",
    emoji: "🌫️",
    members: [
      {
        name: "Alex Fog",
        email: "demo+alex@scavhunt.local",
        phoneE164: "+15550001001",
      },
      {
        name: "Blair Mist",
        email: "demo+blair@scavhunt.local",
        phoneE164: "+15550001002",
      },
    ],
  },
  {
    name: "Cable Car Crew",
    emoji: "🚋",
    members: [
      {
        name: "Casey Cable",
        email: "demo+casey@scavhunt.local",
        phoneE164: "+15550001003",
      },
      {
        name: "Drew Hill",
        email: "demo+drew@scavhunt.local",
        phoneE164: "+15550001004",
      },
    ],
  },
  {
    name: "Mission Mules",
    emoji: "🫏",
    members: [
      {
        name: "Eden Mission",
        email: "demo+eden@scavhunt.local",
        phoneE164: "+15550001005",
      },
      {
        name: "Finn Dolores",
        email: "demo+finn@scavhunt.local",
        phoneE164: "+15550001006",
      },
    ],
  },
  {
    name: "Golden Gate Guerrillas",
    emoji: "🌉",
    members: [
      {
        name: "Gita Bridge",
        email: "demo+gita@scavhunt.local",
        phoneE164: "+15550001007",
      },
      {
        name: "Hugo Span",
        email: "demo+hugo@scavhunt.local",
        phoneE164: "+15550001008",
      },
    ],
  },
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertSameOrigin(req);
  } catch {
    return jsonError(res, "Invalid origin", 403);
  }

  await ensureHuntSettings();

  let teamsCreated = 0;
  let teamsUpdated = 0;
  let usersCreated = 0;
  let usersUpdated = 0;

  for (let i = 0; i < DEMO_TEAMS.length; i++) {
    const demo = DEMO_TEAMS[i];
    const color = TEAM_COLORS[i % TEAM_COLORS.length];

    const existingTeam = await prisma.team.findFirst({
      where: { name: demo.name },
    });

    const team = existingTeam
      ? await prisma.team.update({
          where: { id: existingTeam.id },
          data: { emoji: demo.emoji, color },
        })
      : await prisma.team.create({
          data: { name: demo.name, emoji: demo.emoji, color },
        });

    if (existingTeam) teamsUpdated += 1;
    else teamsCreated += 1;

    for (const member of demo.members) {
      const existingUser = await prisma.user.findUnique({
        where: { email: member.email },
      });

      if (existingUser) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: member.name,
            phoneE164: member.phoneE164,
            teamId: team.id,
            isActive: true,
          },
        });
        usersUpdated += 1;
      } else {
        // Phone may already be taken by a different email — free it first.
        const phoneClash = await prisma.user.findUnique({
          where: { phoneE164: member.phoneE164 },
        });
        if (phoneClash && phoneClash.email !== member.email) {
          await prisma.user.update({
            where: { id: phoneClash.id },
            data: {
              phoneE164: `+1555${String(Date.now()).slice(-7)}${Math.floor(Math.random() * 10)}`,
            },
          });
        }

        await prisma.user.create({
          data: {
            name: member.name,
            email: member.email,
            phoneE164: member.phoneE164,
            teamId: team.id,
            isAdmin: false,
            isActive: true,
          },
        });
        usersCreated += 1;
      }
    }
  }

  return res.status(200).json({
    ok: true,
    teamsCreated,
    teamsUpdated,
    usersCreated,
    usersUpdated,
    teams: DEMO_TEAMS.map((t) => t.name),
  });
}
