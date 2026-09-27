import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import {
  optionalCreatedAtSchema,
  requireAdminApiKey,
  wantsIncludeDeleted,
} from "../../../../lib/agentAuth";
import { includeDeletedWhere } from "../../../../lib/softDelete";
import { prisma } from "../../../../lib/prisma";
import {
  parseJsonBody,
  serializeChallenge,
  serializeSubmission,
  serializeTeam,
} from "../../../../lib/serialize";

const createSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
  challengeId: z.string().min(1),
  note: z.string().max(2000).optional(),
  mediaURL: z.string().url().nullable().optional(),
  posterURL: z.string().url().nullable().optional(),
  /** Default false. Set true to count toward leaderboard immediately. */
  accepted: z.boolean().optional(),
  rejected: z.boolean().optional(),
  /** Artificial timestamp for hunt simulation (ISO-8601). */
  createdAt: optionalCreatedAtSchema,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  if (req.method === "GET") {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const moderationWhere =
      status === "pending"
        ? { accepted: false, rejected: false }
        : status === "accepted"
          ? { accepted: true }
          : status === "rejected"
            ? { rejected: true }
            : {};

    const submissions = await prisma.submission.findMany({
      where: {
        ...includeDeletedWhere(wantsIncludeDeleted(req)),
        ...moderationWhere,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        team: true,
        challenge: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(200).json({
      submissions: submissions.map((s) => ({
        ...serializeSubmission(s),
        deletedAt: s.deletedAt?.toISOString() ?? null,
        team: serializeTeam(s.team),
        challenge: serializeChallenge(s.challenge),
        user: s.user,
      })),
    });
  }

  if (req.method === "POST") {
    const parsed = createSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    }

    const accepted = parsed.data.accepted ?? false;
    const rejected = parsed.data.rejected ?? false;
    if (accepted && rejected) {
      return res
        .status(400)
        .json({ error: "Submission cannot be both accepted and rejected" });
    }

    const [team, user, challenge] = await Promise.all([
      prisma.team.findFirst({
        where: { id: parsed.data.teamId, deletedAt: null },
      }),
      prisma.user.findFirst({
        where: { id: parsed.data.userId, deletedAt: null },
      }),
      prisma.challenge.findFirst({
        where: { id: parsed.data.challengeId, deletedAt: null },
      }),
    ]);
    if (!team) return res.status(404).json({ error: "Team not found" });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!challenge) return res.status(404).json({ error: "Challenge not found" });

    const submission = await prisma.submission.create({
      data: {
        teamId: parsed.data.teamId,
        userId: parsed.data.userId,
        challengeId: parsed.data.challengeId,
        note: parsed.data.note ?? "",
        mediaURL: parsed.data.mediaURL ?? null,
        posterURL: parsed.data.posterURL ?? null,
        accepted,
        rejected,
        ...(parsed.data.createdAt
          ? { createdAt: parsed.data.createdAt }
          : {}),
      },
      include: {
        team: true,
        challenge: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json({
      submission: {
        ...serializeSubmission(submission),
        deletedAt: null,
        team: serializeTeam(submission.team),
        challenge: serializeChallenge(submission.challenge),
        user: submission.user,
      },
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
