import { parse } from "csv-parse/sync";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env / .env.local for standalone script runs (Next loads these automatically).
for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

import { prisma } from "../lib/prisma";

const PLACEHOLDER_NEIGHBORHOODS = [
  "Mission Dolores",
  "Hayes Valley",
  "North Beach",
  "Outer Sunset",
  "Castro Heights",
  "SoMa Flats",
  "Nob Hill",
  "Inner Richmond",
  "Potrero Hill",
  "Bernal Heights",
  "Marina Green",
  "Haight Ashbury",
  "Twin Peaks",
  "Financial District",
  "Pacific Heights",
  "Excelsior",
];

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function seedNeighborhoods() {
  let neighborhoods = await prisma.neighborhood.findMany({
    orderBy: { name: "asc" },
  });

  if (neighborhoods.length === 0) {
    const names = shuffle(PLACEHOLDER_NEIGHBORHOODS).slice(0, 16);
    neighborhoods = await Promise.all(
      names.map((name) => prisma.neighborhood.create({ data: { name } })),
    );
    console.log(`Created ${neighborhoods.length} neighborhoods`);
  } else {
    console.log(`Using ${neighborhoods.length} existing neighborhoods`);
  }

  const anyMatchups = await prisma.matchup.count();
  if (anyMatchups > 0) {
    console.log(`Skipping bracket (${anyMatchups} matchups already exist)`);
    return;
  }

  if (neighborhoods.length < 16) {
    console.log(
      `Need 16 neighborhoods for a full bracket (have ${neighborhoods.length}) — skipping`,
    );
    return;
  }

  const shuffled = shuffle(neighborhoods.slice(0, 16));
  for (let i = 0; i < shuffled.length; i += 2) {
    await prisma.matchup.create({
      data: {
        round: 1,
        slotAId: shuffled[i].id,
        slotBId: shuffled[i + 1].id,
        isOpen: true,
      },
    });
  }
  console.log(`Created ${shuffled.length / 2} round-1 matchups`);
}

async function seedChallengesFromCsv() {
  const csvPath = resolve(process.cwd(), "scripts/sample_challenges.csv");
  if (!existsSync(csvPath)) {
    console.log("No scripts/sample_challenges.csv — skipping challenges");
    return;
  }

  const existing = await prisma.challenge.count();
  if (existing > 0) {
    console.log(`Skipping challenges (${existing} already exist)`);
    return;
  }

  const raw = readFileSync(csvPath, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;

  let created = 0;
  for (const row of rows) {
    const title = row.title || row.Title || row.name;
    const prompt = row.prompt || row.Prompt || row.description || title;
    if (!title) continue;
    const lat = Number(row.lat || row.latitude || 37.7749);
    const lng = Number(row.lng || row.longitude || -122.4194);
    const pts = Number(row.pts || row.points || 100);
    const numWinners = Number(row.numWinners || row.winners || 1);
    await prisma.challenge.create({
      data: {
        title,
        prompt,
        lat: Number.isFinite(lat) ? lat : 37.7749,
        lng: Number.isFinite(lng) ? lng : -122.4194,
        pts: Number.isFinite(pts) ? pts : 100,
        numWinners: Number.isFinite(numWinners) ? numWinners : 1,
      },
    });
    created += 1;
  }
  console.log(`Created ${created} challenges from CSV`);
}

async function main() {
  await seedNeighborhoods();
  await seedChallengesFromCsv();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
