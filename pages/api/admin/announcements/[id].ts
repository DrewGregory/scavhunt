import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../../lib/auth";
import { jsonError } from "../../../../lib/http";
import {
  getAnnouncementMetrics,
  serializeAnnouncement,
} from "../../../../lib/announcements";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(20_000).optional(),
  /** true = publish now; false = unpublish back to draft. */
  publish: z.boolean().optional(),
  /** Manual pin for feed banner / sidebar priority. Only applies while published. */
  pinned: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "GET") {
    const row = await prisma.announcement.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.status(200).json({
      announcement: {
        ...serializeAnnouncement(row),
        metrics: await getAnnouncementMetrics(row.id),
      },
    });
  }

  if (req.method === "PATCH") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const parsed = patchSchema.safeParse(
      typeof req.body === "string" ? JSON.parse(req.body) : req.body,
    );
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const existing = await prisma.announcement.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const data: {
      title?: string;
      body?: string;
      publishedAt?: Date | null;
      pinned?: boolean;
    } = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.body !== undefined) data.body = parsed.data.body;
    if (parsed.data.publish === true) {
      data.publishedAt = existing.publishedAt ?? new Date();
    } else if (parsed.data.publish === false) {
      data.publishedAt = null;
      data.pinned = false;
    }
    if (parsed.data.pinned !== undefined && parsed.data.publish !== false) {
      const willBePublished =
        parsed.data.publish === true ||
        (parsed.data.publish === undefined && existing.publishedAt != null);
      if (!willBePublished && parsed.data.pinned) {
        return res
          .status(400)
          .json({ error: "Publish before pinning an announcement" });
      }
      data.pinned = parsed.data.pinned;
    }

    // Only one announcement may be pinned at a time.
    const row =
      data.pinned === true
        ? await prisma.$transaction(async (tx) => {
            await tx.announcement.updateMany({
              where: {
                deletedAt: null,
                pinned: true,
                id: { not: id },
              },
              data: { pinned: false },
            });
            return tx.announcement.update({ where: { id }, data });
          })
        : await prisma.announcement.update({
            where: { id },
            data,
          });

    return res.status(200).json({
      announcement: {
        ...serializeAnnouncement(row),
        metrics: await getAnnouncementMetrics(row.id),
      },
    });
  }

  if (req.method === "DELETE") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }

    const existing = await prisma.announcement.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    await prisma.announcement.update({
      where: { id },
      data: { deletedAt: new Date(), publishedAt: null, pinned: false },
    });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
