/**
 * One-shot local seed of demo teams/users + hunt settings.
 * Usage: pnpm exec tsx scripts/seed-demo-local.ts
 */
import { prisma } from "../lib/prisma";
import { ensureHuntSettings } from "../lib/time";

const TEAM_COLORS = [
  "#E53E3E",
  "#DD6B20",
  "#D69E2E",
  "#38A169",
  "#319795",
  "#3182CE",
  "#5A67D8",
  "#805AD5",
] as const;

const DEMO = [
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
] as const;

async function main() {
  await ensureHuntSettings();

  let teamsCreated = 0;
  let teamsUpdated = 0;
  let usersCreated = 0;
  let usersUpdated = 0;

  for (let i = 0; i < DEMO.length; i++) {
    const demo = DEMO[i];
    const color = TEAM_COLORS[i % TEAM_COLORS.length];
    const existing = await prisma.team.findFirst({ where: { name: demo.name } });
    const team = existing
      ? await prisma.team.update({
          where: { id: existing.id },
          data: { emoji: demo.emoji, color },
        })
      : await prisma.team.create({
          data: { name: demo.name, emoji: demo.emoji, color },
        });
    if (existing) teamsUpdated += 1;
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

  const hs = await prisma.huntSettings.findUnique({ where: { id: "default" } });
  console.log({
    teamsCreated,
    teamsUpdated,
    usersCreated,
    usersUpdated,
    territoryEnabled: hs?.territoryEnabled,
    startsAt: hs?.startsAt,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
