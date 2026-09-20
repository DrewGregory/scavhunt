import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";
import { jsonError } from "../../../lib/http";
import {
  closeCurrentRound,
  createOpeningRound,
  ensureNeighborhoods,
  ensureRoundClosedIfExpired,
  getRoundScheduleMap,
} from "../../../lib/tournament";
import { SF_NEIGHBORHOODS } from "../../../lib/neighborhoods";

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("closeRound") }),
  z.object({ action: z.literal("initialize") }),
  z.object({
    action: z.literal("setRoundSchedule"),
    round: z.number().int().min(1).max(16),
    endsAt: z.string().min(1),
  }),
]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    await ensureRoundClosedIfExpired();

    const [openMatchups, totalMatchups, neighborhoodCount, schedule] =
      await Promise.all([
        prisma.matchup.findMany({
          where: { isOpen: true },
          include: {
            slotA: true,
            slotB: true,
            winner: true,
            votes: true,
          },
          orderBy: [{ round: "asc" }, { id: "asc" }],
        }),
        prisma.matchup.count(),
        prisma.neighborhood.count(),
        getRoundScheduleMap(),
      ]);

    const currentRound =
      openMatchups.length > 0
        ? Math.max(...openMatchups.map((m) => m.round))
        : null;

    const matchups = openMatchups
      .filter((m) => currentRound == null || m.round === currentRound)
      .map((m) => {
        const votesA = m.votes.filter(
          (v) => v.neighborhoodId === m.slotAId,
        ).length;
        const votesB = m.votes.filter(
          (v) => v.neighborhoodId === m.slotBId,
        ).length;
        return {
          id: m.id,
          round: m.round,
          isOpen: m.isOpen,
          winnerId: m.winnerId,
          slotA: { id: m.slotA.id, name: m.slotA.name },
          slotB: { id: m.slotB.id, name: m.slotB.name },
          winner: m.winner
            ? { id: m.winner.id, name: m.winner.name }
            : null,
          votes: {
            [m.slotAId]: votesA,
            [m.slotBId]: votesB,
          },
          totalVotes: m.votes.length,
        };
      });

    const notStarted = totalMatchups === 0;
    const complete = !notStarted && openMatchups.length === 0;

    return res.status(200).json({
      currentRound,
      matchups,
      complete,
      notStarted,
      neighborhoodCount,
      totalMatchups,
      schedule,
      currentRoundEndsAt:
        currentRound != null ? (schedule[currentRound] ?? null) : null,
    });
  }

  if (req.method === "POST") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const parsed = postSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    if (parsed.data.action === "setRoundSchedule") {
      const endsAt = new Date(parsed.data.endsAt);
      if (Number.isNaN(endsAt.getTime())) {
        return res.status(400).json({ error: "Invalid endsAt" });
      }
      const row = await prisma.tournamentRoundSchedule.upsert({
        where: { round: parsed.data.round },
        create: { round: parsed.data.round, endsAt },
        update: { endsAt },
      });
      return res.status(200).json({
        ok: true,
        round: row.round,
        endsAt: row.endsAt.toISOString(),
      });
    }

    if (parsed.data.action === "initialize") {
      const existingOpen = await prisma.matchup.count({
        where: { isOpen: true },
      });
      if (existingOpen > 0) {
        return res.status(400).json({
          error: "Open matchups already exist — refuse to re-initialize",
        });
      }

      const existingAny = await prisma.matchup.count();
      if (existingAny > 0) {
        return res.status(400).json({
          error:
            "Tournament already has matchups (possibly finished). Clear matchups in the DB before re-initializing.",
        });
      }

      // Upsert the full SF list, then include every neighborhood row in Round 1
      // (supports any N — odd counts get a bye).
      await ensureNeighborhoods(SF_NEIGHBORHOODS);
      const neighborhoods = await prisma.neighborhood.findMany({
        orderBy: { name: "asc" },
      });
      if (neighborhoods.length < 2) {
        return res.status(400).json({
          error: `Need at least 2 neighborhoods to start (have ${neighborhoods.length})`,
        });
      }

      const result = await createOpeningRound(neighborhoods.map((n) => n.id));

      return res.status(200).json({
        success: true,
        created: result.matchupsCreated,
        byes: result.byes,
        entrants: result.entrants,
      });
    }

    const openCount = await prisma.matchup.count({ where: { isOpen: true } });
    if (openCount === 0) {
      const total = await prisma.matchup.count();
      return res.status(400).json({
        error:
          total === 0
            ? "Tournament not started — initialize the bracket first"
            : "No open matchups to close",
        complete: total > 0,
        notStarted: total === 0,
      });
    }

    const result = await closeCurrentRound();
    return res.status(200).json({
      success: true,
      complete: result.complete,
      nextRoundOpen: !result.complete,
      closedRound: result.closedRound,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
