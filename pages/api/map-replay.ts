import type { NextApiRequest, NextApiResponse } from "next";
import { requireApiUser, requireHuntAccessApi } from "../../lib/auth";
import { isTerritoryEnabled } from "../../lib/territoryGate";
import { getHuntSettings } from "../../lib/time";
import { prisma } from "../../lib/prisma";

export type MapReplayDepositEvent = {
  neighborhoodId: string;
  teamId: string;
  teamName: string;
  teamEmoji: string;
  teamColor: string;
  points: number;
  createdAt: string;
};

export type MapReplayLocationSample = {
  id: string;
  teamId: string;
  lat: number;
  lng: number;
  createdAt: string;
};

/**
 * Full map-replay timeline: deposit events (+ voids) and location samples.
 * Client scrubs locally for smooth territory + pin playback.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiUser(req, res);
  if (!user) return;
  if (!(await requireHuntAccessApi(res, user))) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const hunt = await getHuntSettings();
  const start = hunt.startsAt;
  const end = hunt.endsAt;

  const territoryGloballyEnabled = await isTerritoryEnabled();
  const showTerritory = territoryGloballyEnabled || user.isAdmin;

  // Historical location samples stay available for replay until you wipe "Location".
  const [depositRows, locationRows, earnedRows, teams] = await Promise.all([
    showTerritory
      ? prisma.neighborhoodDeposit.findMany({
          // Include soft-deleted deposits so voids can be replayed.
          where: {
            createdAt: { lte: end },
            neighborhood: { onMap: true, deletedAt: null },
          },
          orderBy: { createdAt: "asc" },
          select: {
            neighborhoodId: true,
            teamId: true,
            points: true,
            createdAt: true,
            deletedAt: true,
            team: {
              select: { name: true, emoji: true, color: true },
            },
          },
        })
      : Promise.resolve([]),
    prisma.location.findMany({
      where: {
        createdAt: { lte: end },
        team: { deletedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        teamId: true,
        lat: true,
        lng: true,
        createdAt: true,
      },
    }),
    // Tiebreaker points: same rule as the territory leaderboard (accepted challenge pts).
    prisma.submission.findMany({
      where: {
        deletedAt: null,
        accepted: true,
        createdAt: { lte: end },
        team: { deletedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        teamId: true,
        createdAt: true,
        challenge: { select: { pts: true } },
      },
    }),
    prisma.team.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, emoji: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const deposits: MapReplayDepositEvent[] = [];
  for (const d of depositRows) {
    deposits.push({
      neighborhoodId: d.neighborhoodId,
      teamId: d.teamId,
      teamName: d.team.name,
      teamEmoji: d.team.emoji,
      teamColor: d.team.color,
      points: d.points,
      createdAt: d.createdAt.toISOString(),
    });
    if (d.deletedAt && d.deletedAt.getTime() <= end.getTime()) {
      deposits.push({
        neighborhoodId: d.neighborhoodId,
        teamId: d.teamId,
        teamName: d.team.name,
        teamEmoji: d.team.emoji,
        teamColor: d.team.color,
        points: -d.points,
        createdAt: d.deletedAt.toISOString(),
      });
    }
  }
  deposits.sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );

  // Downsample location pings to ~2 minutes per team; always keep each team's last.
  const MIN_GAP_MS = 2 * 60 * 1000;
  const locations: MapReplayLocationSample[] = [];
  const lastKept = new Map<string, number>();
  for (const loc of locationRows) {
    const t = loc.createdAt.getTime();
    const prev = lastKept.get(loc.teamId);
    if (prev != null && t - prev < MIN_GAP_MS) continue;
    lastKept.set(loc.teamId, t);
    locations.push({
      id: loc.id,
      teamId: loc.teamId,
      lat: loc.lat,
      lng: loc.lng,
      createdAt: loc.createdAt.toISOString(),
    });
  }
  const lastByTeam = new Map<string, (typeof locationRows)[number]>();
  for (const loc of locationRows) lastByTeam.set(loc.teamId, loc);
  const keptIds = new Set(locations.map((l) => l.id));
  for (const loc of lastByTeam.values()) {
    if (keptIds.has(loc.id)) continue;
    locations.push({
      id: loc.id,
      teamId: loc.teamId,
      lat: loc.lat,
      lng: loc.lng,
      createdAt: loc.createdAt.toISOString(),
    });
  }
  locations.sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );

  const earned = earnedRows.map((s) => ({
    teamId: s.teamId,
    points: s.challenge.pts,
    createdAt: s.createdAt.toISOString(),
  }));

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    start: start.toISOString(),
    end: end.toISOString(),
    deposits,
    locations,
    earned,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      emoji: t.emoji,
    })),
  });
}
