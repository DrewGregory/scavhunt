import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import {
  assertSameOrigin,
  requireApiUser,
  requireHuntAccessApi,
} from "../../../../lib/auth";
import { jsonError } from "../../../../lib/http";
import {
  parseJsonBody,
  serializeSubmissionComment,
} from "../../../../lib/serialize";
import type { SerializedSubmissionComment } from "../../../../lib/types";

const postSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

async function loadSubmission(submissionId: string) {
  return prisma.submission.findFirst({
    where: {
      id: submissionId,
      deletedAt: null,
      team: { deletedAt: null },
      challenge: { deletedAt: null, enabled: true },
    },
    select: { id: true },
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | { comments: SerializedSubmissionComment[] }
    | { comment: SerializedSubmissionComment }
    | { error: string }
  >,
) {
  const submissionId =
    typeof req.query.submissionId === "string" ? req.query.submissionId : "";
  if (!submissionId) {
    return jsonError(res, "Missing submission id", 400);
  }

  const user = await requireApiUser(req, res);
  if (!user) return;
  if (!(await requireHuntAccessApi(res, user))) return;

  if (req.method === "GET") {
    const submission = await loadSubmission(submissionId);
    if (!submission) {
      return jsonError(res, "Submission not found", 404);
    }

    const rows = await prisma.submissionComment.findMany({
      where: { submissionId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        user: { include: { team: true } },
      },
    });

    return res.status(200).json({
      comments: rows.map(serializeSubmissionComment),
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
      return jsonError(res, parsed.error.issues[0]?.message ?? "Invalid body", 400);
    }

    const submission = await loadSubmission(submissionId);
    if (!submission) {
      return jsonError(res, "Submission not found", 404);
    }

    const created = await prisma.submissionComment.create({
      data: {
        submissionId,
        userId: user.id,
        body: parsed.data.body,
      },
      include: {
        user: { include: { team: true } },
      },
    });

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(201).json({
      comment: serializeSubmissionComment(created),
    });
  }

  return jsonError(res, "Method not allowed", 405);
}
