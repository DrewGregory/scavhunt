import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { assertSameOrigin, requireApiUser } from "../../../../lib/auth";
import { jsonError } from "../../../../lib/http";

/** Record that the current user dismissed an announcement. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiUser(req, res);
  if (!user) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertSameOrigin(req);
  } catch {
    return jsonError(res, "Invalid origin", 403);
  }

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ error: "Missing id" });

  const announcement = await prisma.announcement.findFirst({
    where: { id, deletedAt: null, publishedAt: { not: null } },
    select: { id: true },
  });
  if (!announcement) return res.status(404).json({ error: "Not found" });

  await prisma.announcementDismissal.upsert({
    where: {
      announcementId_userId: { announcementId: id, userId: user.id },
    },
    create: { announcementId: id, userId: user.id },
    update: { dismissedAt: new Date() },
  });

  return res.status(200).json({ ok: true });
}
