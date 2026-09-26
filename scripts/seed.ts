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
    const latRaw = row.lat || row.latitude;
    const lngRaw = row.lng || row.longitude;
    const latN = latRaw != null && latRaw !== "" ? Number(latRaw) : null;
    const lngN = lngRaw != null && lngRaw !== "" ? Number(lngRaw) : null;
    const pts = Number(row.pts || row.points || 100);
    const numWinners = Number(row.numWinners || row.winners || 1);
    await prisma.challenge.create({
      data: {
        title,
        prompt,
        lat: latN != null && Number.isFinite(latN) ? latN : null,
        lng: lngN != null && Number.isFinite(lngN) ? lngN : null,
        pts: Number.isFinite(pts) ? pts : 100,
        numWinners: Number.isFinite(numWinners) ? numWinners : 1,
      },
    });
    created += 1;
  }
  console.log(`Created ${created} challenges from CSV`);
}

async function main() {
  await seedChallengesFromCsv();
  const { ensureHuntSettings } = await import("../lib/time");
  await ensureHuntSettings();
  console.log("Hunt settings ensured");
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
