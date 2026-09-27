import type { NextApiRequest, NextApiResponse } from "next";
import {
  listPublishedAnnouncements,
  serializeAnnouncement,
} from "../../../lib/announcements";
import { requireApiUser } from "../../../lib/auth";

/** All published announcements for the announcements page. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiUser(req, res);
  if (!user) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rows = await listPublishedAnnouncements();
  return res.status(200).json({
    announcements: rows.map(serializeAnnouncement),
  });
}
