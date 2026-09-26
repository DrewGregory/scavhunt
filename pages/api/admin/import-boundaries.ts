import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { jsonError } from "../../../lib/http";
import { parseJsonBody } from "../../../lib/serialize";
import { validateBoundary } from "../../../lib/geo";
import type { TopologyFile, ZoneObject } from "../../../lib/topology";
import { geometryFromObject } from "../../../lib/topology";
// Bundled seeds (standalone Docker + local). Rebuild with:
//   pnpm topology:build   → data/sf-topology.json  (curated gap-free)
//   pnpm datasf:build     → data/sf-datasf-117.json (raw 117 DataSF zones)
import topologySeed from "../../../data/sf-topology.json";
import datasfSeed from "../../../data/sf-datasf-117.json";

type DatasfSeed = {
  neighborhoods: Array<{
    name: string;
    isIsland?: boolean;
    geometry: unknown;
    centerLat?: number;
    centerLng?: number;
  }>;
};

const bodySchema = z.object({
  /**
   * reset-topology: re-apply curated shared-arc topology + boundaries for
   * neighborhoods that already exist (matched by unique name). No create/demote.
   * reset-neighborhoods: full curated reseed (create/update/demote). Requires
   * zero live deposits.
   * source: legacy alias — curated → reset-neighborhoods, datasf still supported.
   */
  action: z
    .enum(["reset-topology", "reset-neighborhoods"])
    .optional(),
  source: z.enum(["curated", "datasf"]).optional(),
});

async function demoteNotIn(importedNames: Set<string>): Promise<number> {
  const leftovers = await prisma.neighborhood.findMany({
    where: {
      onMap: true,
      name: { notIn: Array.from(importedNames) },
    },
  });
  for (const n of leftovers) {
    await prisma.neighborhood.update({
      where: { id: n.id },
      data: { onMap: false },
    });
  }
  return leftovers.length;
}

async function upsertNeighborhood(item: {
  name: string;
  geometry: unknown;
  centerLat?: number | null;
  centerLng?: number | null;
  isIsland?: boolean;
}): Promise<{ id: string; created: boolean } | { error: string }> {
  const validated = validateBoundary(item.geometry);
  if (!validated.ok) {
    return { error: `${item.name}: ${validated.error}` };
  }

  const centerLat = item.centerLat ?? validated.center.lat;
  const centerLng = item.centerLng ?? validated.center.lng;
  const isIsland = Boolean(item.isIsland);

  const existing = await prisma.neighborhood.findUnique({
    where: { name: item.name },
  });

  if (existing) {
    await prisma.neighborhood.update({
      where: { id: existing.id },
      data: {
        boundary: validated.geometry as unknown as Prisma.InputJsonValue,
        centerLat,
        centerLng,
        onMap: true,
        isIsland,
        deletedAt: null,
      },
    });
    return { id: existing.id, created: false };
  }

  const row = await prisma.neighborhood.create({
    data: {
      name: item.name,
      boundary: validated.geometry as unknown as Prisma.InputJsonValue,
      centerLat,
      centerLng,
      onMap: true,
      isIsland,
    },
  });
  return { id: row.id, created: true };
}

async function resetTopologyByName(res: NextApiResponse) {
  const raw = topologySeed as unknown as TopologyFile;
  if (!raw?.arcs?.length || !raw?.neighborhoods?.length) {
    return res.status(500).json({
      error:
        "Bundled topology is empty — run pnpm topology:build and redeploy",
    });
  }

  const existing = await prisma.neighborhood.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((n) => [n.name, n.id]));

  let matched = 0;
  let missing = 0;
  const errors: string[] = [];
  const objectsById: Record<string, ZoneObject> = {};

  for (const item of raw.neighborhoods) {
    if (!item?.name || !item.geometry) {
      missing += 1;
      continue;
    }
    const id = byName.get(item.name);
    if (!id) {
      missing += 1;
      continue;
    }

    const zoneObj = raw.objectsByName[item.name];
    const fromArcs = zoneObj
      ? geometryFromObject(raw.arcs, zoneObj)
      : item.geometry;

    const validated = validateBoundary(fromArcs);
    if (!validated.ok) {
      errors.push(`${item.name}: ${validated.error}`);
      continue;
    }

    await prisma.neighborhood.update({
      where: { id },
      data: {
        boundary: validated.geometry as unknown as Prisma.InputJsonValue,
        centerLat: item.centerLat ?? validated.center.lat,
        centerLng: item.centerLng ?? validated.center.lng,
        isIsland: Boolean(item.isIsland),
        onMap: true,
      },
    });

    matched += 1;
    if (zoneObj) {
      objectsById[id] = {
        ...zoneObj,
        isIsland: Boolean(item.isIsland),
      };
    }
  }

  if (matched === 0) {
    return res.status(400).json({
      error:
        "No existing neighborhoods matched curated seed names — add/reset neighborhoods first",
    });
  }

  await prisma.mapTopology.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      transform: (raw.transform ?? Prisma.DbNull) as Prisma.InputJsonValue,
      arcs: raw.arcs as unknown as Prisma.InputJsonValue,
      objects: objectsById as unknown as Prisma.InputJsonValue,
      lockedArcs: raw.lockedArcs as unknown as Prisma.InputJsonValue,
      version: 1,
    },
    update: {
      transform: (raw.transform ?? Prisma.DbNull) as Prisma.InputJsonValue,
      arcs: raw.arcs as unknown as Prisma.InputJsonValue,
      objects: objectsById as unknown as Prisma.InputJsonValue,
      lockedArcs: raw.lockedArcs as unknown as Prisma.InputJsonValue,
      version: { increment: 1 },
    },
  });

  return res.status(200).json({
    ok: true,
    action: "reset-topology",
    matched,
    missingInDb: missing,
    arcCount: raw.arcs.length,
    errors: errors.slice(0, 20),
  });
}

async function importCurated(res: NextApiResponse) {
  const raw = topologySeed as unknown as TopologyFile;
  if (!raw?.arcs?.length || !raw?.neighborhoods?.length) {
    return res.status(500).json({
      error:
        "Bundled topology is empty — run pnpm topology:build and redeploy",
    });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const objectsById: Record<string, ZoneObject> = {};
  const importedNames = new Set<string>();

  for (const item of raw.neighborhoods) {
    if (!item?.name || !item.geometry) {
      skipped += 1;
      continue;
    }

    const zoneObj = raw.objectsByName[item.name];
    const fromArcs = zoneObj
      ? geometryFromObject(raw.arcs, zoneObj)
      : item.geometry;

    const result = await upsertNeighborhood({
      name: item.name,
      geometry: fromArcs,
      centerLat: item.centerLat,
      centerLng: item.centerLng,
      isIsland: item.isIsland,
    });
    if ("error" in result) {
      errors.push(result.error);
      skipped += 1;
      continue;
    }

    importedNames.add(item.name);
    if (result.created) created += 1;
    else updated += 1;

    if (zoneObj) {
      objectsById[result.id] = {
        ...zoneObj,
        isIsland: Boolean(item.isIsland),
      };
    }
  }

  const demoted = await demoteNotIn(importedNames);

  await prisma.mapTopology.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      transform: (raw.transform ?? Prisma.DbNull) as Prisma.InputJsonValue,
      arcs: raw.arcs as unknown as Prisma.InputJsonValue,
      objects: objectsById as unknown as Prisma.InputJsonValue,
      lockedArcs: raw.lockedArcs as unknown as Prisma.InputJsonValue,
      version: 1,
    },
    update: {
      transform: (raw.transform ?? Prisma.DbNull) as Prisma.InputJsonValue,
      arcs: raw.arcs as unknown as Prisma.InputJsonValue,
      objects: objectsById as unknown as Prisma.InputJsonValue,
      lockedArcs: raw.lockedArcs as unknown as Prisma.InputJsonValue,
      version: { increment: 1 },
    },
  });

  return res.status(200).json({
    ok: true,
    source: "curated",
    created,
    updated,
    skipped,
    demoted,
    zoneCount: importedNames.size,
    arcCount: raw.arcs.length,
    errors: errors.slice(0, 20),
  });
}

async function importDatasf(res: NextApiResponse) {
  const raw = datasfSeed as unknown as DatasfSeed;
  if (!raw?.neighborhoods?.length) {
    return res.status(500).json({
      error: "Bundled DataSF seed is empty — run pnpm datasf:build and redeploy",
    });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const importedNames = new Set<string>();

  for (const item of raw.neighborhoods) {
    if (!item?.name || !item.geometry) {
      skipped += 1;
      continue;
    }

    const result = await upsertNeighborhood({
      name: item.name,
      geometry: item.geometry,
      centerLat: item.centerLat,
      centerLng: item.centerLng,
      isIsland: item.isIsland,
    });
    if ("error" in result) {
      errors.push(result.error);
      skipped += 1;
      continue;
    }

    importedNames.add(item.name);
    if (result.created) created += 1;
    else updated += 1;
  }

  const demoted = await demoteNotIn(importedNames);

  // Raw DataSF polygons aren't a shared-arc partition — clear topology so the
  // arc editor doesn't pretend borders share cleanly.
  await prisma.mapTopology.deleteMany({ where: { id: "default" } });

  return res.status(200).json({
    ok: true,
    source: "datasf",
    created,
    updated,
    skipped,
    demoted,
    zoneCount: importedNames.size,
    arcCount: 0,
    errors: errors.slice(0, 20),
  });
}

/**
 * Import neighborhood boundaries from a bundled seed.
 *
 * Body: { source?: "curated" | "datasf" }
 * - curated (default): gap-free map + shared-arc MapTopology
 * - datasf: all 117 DataSF polygons (no shared topology)
 *
 * Switching sources demotes the other set off the player map; rows are kept.
 * The curated seed file is never deleted — re-import curated to restore it.
 */
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

  const parsed = bodySchema.safeParse(parseJsonBody(req.body) ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body" });
  }

  if (parsed.data.action === "reset-topology") {
    return resetTopologyByName(res);
  }

  // reset-neighborhoods (default) or legacy source=curated|datasf
  const liveDeposits = await prisma.neighborhoodDeposit.count({
    where: { deletedAt: null },
  });
  if (liveDeposits > 0) {
    return res.status(409).json({
      error: `Can't reset neighborhoods while ${liveDeposits} live deposit(s) exist. Soft-delete them first.`,
      liveDeposits,
    });
  }

  if (parsed.data.source === "datasf") {
    return importDatasf(res);
  }
  return importCurated(res);
}
