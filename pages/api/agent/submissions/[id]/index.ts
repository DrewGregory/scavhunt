import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import {
  optionalCreatedAtSchema,
  requireAdminApiKey,
} from "../../../../../lib/agentAuth";
import { prisma } from "../../../../../lib/prisma";
import { parseJsonBody, serializeSubmission } from "../../../../../lib/serialize";

const patchSchema = z.object({
  /** Artificial timestamp for hunt simulation (ISO-8601). */
  createdAt: optionalCreatedAtSchema,
  note: z.string().max(2000).optional(),
  mediaURL: z.string().url().nullable().optional(),
  posterURL: z.string().url().nullable().optional(),
  accepted: z.boolean().optional(),
  rejected: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireAdminApiKey(req, res)) return;

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "PATCH") {
    const parsed = patchSchema.safeParse(parseJsonBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid body",
        details: parsed.error.flatten(),
      });
    }

    const existing = await prisma.submission.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const accepted = parsed.data.accepted ?? existing.accepted;
    const rejected = parsed.data.rejected ?? existing.rejected;
    if (accepted && rejected) {
      return res
        .status(400)
        .json({ error: "Submission cannot be both accepted and rejected" });
    }

    const submission = await prisma.submission.update({
      where: { id },
      data: {
        ...(parsed.data.createdAt
          ? { createdAt: parsed.data.createdAt }
          : {}),
        ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
        ...(parsed.data.mediaURL !== undefined
          ? { mediaURL: parsed.data.mediaURL }
          : {}),
        ...(parsed.data.posterURL !== undefined
          ? { posterURL: parsed.data.posterURL }
          : {}),
        ...(parsed.data.accepted !== undefined
          ? { accepted: parsed.data.accepted }
          : {}),
        ...(parsed.data.rejected !== undefined
          ? { rejected: parsed.data.rejected }
          : {}),
      },
    });

    return res.status(200).json({
      submission: {
        ...serializeSubmission(submission),
        deletedAt: submission.deletedAt?.toISOString() ?? null,
      },
    });
  }

  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const existing = await prisma.submission.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: "Submission not found" });
  }
  if (existing.deletedAt) {
    return res.status(200).json({ ok: true, alreadyDeleted: true });
  }

  const submission = await prisma.submission.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return res.status(200).json({
    ok: true,
    submission: {
      ...serializeSubmission(submission),
      deletedAt: submission.deletedAt?.toISOString() ?? null,
    },
  });
}
