import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../../lib/auth";
import { jsonError } from "../../../../lib/http";
import {
  getAnnouncementMetrics,
  serializeAnnouncement,
} from "../../../../lib/announcements";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  /** If true, publish immediately. */
  publish: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const rows = await prisma.announcement.findMany({
      where: { deletedAt: null },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });
    const announcements = await Promise.all(
      rows.map(async (row) => ({
        ...serializeAnnouncement(row),
        metrics: await getAnnouncementMetrics(row.id),
      })),
    );
    return res.status(200).json({ announcements });
  }

  if (req.method === "POST") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const parsed = createSchema.safeParse(
      typeof req.body === "string" ? JSON.parse(req.body) : req.body,
    );
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const row = await prisma.announcement.create({
      data: {
        title: parsed.data.title,
        body: parsed.data.body,
        createdById: admin.id,
        publishedAt: parsed.data.publish ? new Date() : null,
      },
    });

    return res.status(201).json({
      announcement: {
        ...serializeAnnouncement(row),
        metrics: await getAnnouncementMetrics(row.id),
      },
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
