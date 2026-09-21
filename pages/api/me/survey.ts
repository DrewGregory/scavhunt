import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiUser } from "../../../lib/auth";
import { jsonError } from "../../../lib/http";

const putSchema = z
  .object({
    intent: z.enum(["playing", "browsing"]),
    teamPreferences: z.string().optional(),
    competitiveness: z.string().optional(),
    timeCommitment: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.intent === "playing") {
      if (!val.teamPreferences?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Team preferences are required if you plan to play",
          path: ["teamPreferences"],
        });
      }
      if (!val.competitiveness?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Competitiveness is required if you plan to play",
          path: ["competitiveness"],
        });
      }
      if (!val.timeCommitment?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Time commitment is required if you plan to play",
          path: ["timeCommitment"],
        });
      }
    }
  });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    return res.status(200).json({
      intent: user.intent,
      teamPreferences: user.teamPreferences,
      competitiveness: user.competitiveness,
      timeCommitment: user.timeCommitment,
      surveyCompletedAt: user.surveyCompletedAt?.toISOString() ?? null,
    });
  }

  if (req.method === "PUT") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || "Invalid body",
      });
    }

    const { intent, teamPreferences, competitiveness, timeCommitment } =
      parsed.data;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        intent,
        teamPreferences:
          intent === "playing" ? teamPreferences!.trim() : null,
        competitiveness:
          intent === "playing" ? competitiveness!.trim() : null,
        timeCommitment:
          intent === "playing" ? timeCommitment!.trim() : null,
        surveyCompletedAt: new Date(),
      },
    });

    return res.status(200).json({
      ok: true,
      intent: updated.intent,
      teamPreferences: updated.teamPreferences,
      competitiveness: updated.competitiveness,
      timeCommitment: updated.timeCommitment,
      surveyCompletedAt: updated.surveyCompletedAt!.toISOString(),
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
