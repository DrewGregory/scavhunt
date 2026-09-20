import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import {
  assertSameOrigin,
  requireApiAdmin,
} from "../../../lib/auth";
import { parseJsonBody } from "../../../lib/serialize";
import { jsonError } from "../../../lib/http";

const postSchema = z.object({
  action: z.literal("closeRound"),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const openMatchups = await prisma.matchup.findMany({
      where: { isOpen: true },
      include: {
        slotA: true,
        slotB: true,
        winner: true,
        votes: true,
      },
      orderBy: [{ round: "asc" }, { id: "asc" }],
    });

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

    return res.status(200).json({
      currentRound,
      matchups,
      complete: openMatchups.length === 0,
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

    const openMatchups = await prisma.matchup.findMany({
      where: { isOpen: true },
      include: { votes: true },
      orderBy: [{ round: "asc" }, { id: "asc" }],
    });

    if (openMatchups.length === 0) {
      return res.status(400).json({
        error: "No open matchups to close",
        complete: true,
      });
    }

    const maxOpenRound = Math.max(...openMatchups.map((m) => m.round));
    const roundMatchups = openMatchups.filter((m) => m.round === maxOpenRound);

    await prisma.$transaction(async (tx) => {
      for (const matchup of roundMatchups) {
        const votesA = matchup.votes.filter(
          (v) => v.neighborhoodId === matchup.slotAId,
        ).length;
        const votesB = matchup.votes.filter(
          (v) => v.neighborhoodId === matchup.slotBId,
        ).length;
        // Tie goes to slotA
        const winnerId =
          votesB > votesA ? matchup.slotBId : matchup.slotAId;

        await tx.matchup.update({
          where: { id: matchup.id },
          data: { winnerId, isOpen: false },
        });
      }

      const allInRound = await tx.matchup.findMany({
        where: { round: maxOpenRound },
        orderBy: { id: "asc" },
      });

      const winners = allInRound
        .map((m) => m.winnerId)
        .filter((id): id is string => id != null);

      if (winners.length <= 1) {
        return;
      }

      const nextRound = maxOpenRound + 1;
      for (let i = 0; i + 1 < winners.length; i += 2) {
        await tx.matchup.create({
          data: {
            round: nextRound,
            slotAId: winners[i],
            slotBId: winners[i + 1],
            isOpen: true,
          },
        });
      }

      // Odd leftover gets a bye (closed matchup, auto-advance)
      if (winners.length % 2 === 1) {
        const byeId = winners[winners.length - 1];
        await tx.matchup.create({
          data: {
            round: nextRound,
            slotAId: byeId,
            slotBId: byeId,
            winnerId: byeId,
            isOpen: false,
          },
        });
      }
    });

    const stillOpen = await prisma.matchup.count({ where: { isOpen: true } });

    return res.status(200).json({
      success: true,
      complete: stillOpen === 0,
      nextRoundOpen: stillOpen > 0,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
