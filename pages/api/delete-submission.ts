import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireApiAdmin } from "../../lib/auth";
import { parseJsonBody } from "../../lib/serialize";

const requestBodySchema = z.object({
  submissionId: z.string(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireApiAdmin(req, res);
  if (!user) return;

  const parsedReq = requestBodySchema.safeParse(parseJsonBody(req.body));
  if (!parsedReq.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const { submissionId } = parsedReq.data;

  try {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (submission == null) {
      return res.status(404).json({
        error: `Submission with id '${submissionId}' not found`,
      });
    }

    await prisma.submission.delete({ where: { id: submissionId } });

    return res.status(200).json({
      success: true,
      message: "Submission deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting submission:", error);
    return res.status(500).json({
      error: "Failed to delete submission",
    });
  }
}
