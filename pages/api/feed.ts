import type { NextApiRequest, NextApiResponse } from "next";
import { requireApiUser, requireHuntAccessApi } from "../../lib/auth";
import { getFeedPage, parseFeedQuery } from "../../lib/feedQuery";
import type { FeedPage } from "../../lib/feedTypes";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FeedPage | { error: string }>,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireApiUser(req, res);
  if (!user) return;
  if (!(await requireHuntAccessApi(res, user))) return;

  try {
    const { filters, cursor, limit } = parseFeedQuery(req.query);
    const page = await getFeedPage({
      userId: user.id,
      filters,
      cursor,
      limit,
    });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(page);
  } catch (error) {
    console.error("Error loading feed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
