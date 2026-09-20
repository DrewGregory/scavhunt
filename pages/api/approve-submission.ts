import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireApiAdmin } from "../../lib/auth";
import { parseJsonBody } from "../../lib/serialize";

const requestBodySchema = z.object({
  submissionId: z.string(),
  accepted: z.boolean().optional(),
  rejected: z.boolean().optional(),
});

type ResponseData = { success: boolean } | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
) {
  const user = await requireApiAdmin(req, res);
  if (!user) return;

  const parsedReq = requestBodySchema.safeParse(parseJsonBody(req.body));
  if (!parsedReq.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const { submissionId, accepted, rejected } = parsedReq.data;

  let update: { accepted: boolean; rejected: boolean };
  if (accepted === true) {
    update = { accepted: true, rejected: false };
  } else if (rejected === true) {
    update = { accepted: false, rejected: true };
  } else {
    update = { accepted: false, rejected: false };
  }

  await prisma.submission.update({
    where: { id: submissionId },
    data: update,
  });

  return res.status(200).json({ success: true });
}
