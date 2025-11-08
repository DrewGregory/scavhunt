import type { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../lib/dbConnect";
import { getTeamFromCookie } from "../../lib/team";
import { LikeModel } from "../../models/Like";
import { ChatModel } from "../../models/Chat";

type ResponseData = {
  likes: Record<string, number>;
  comments: Record<string, number>;
} | {
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await dbConnect();

  const team = await getTeamFromCookie(req.cookies);
  if (team == null) {
    return res.status(401).json({ error: "Not signed in" });
  }

  try {
    // Get all likes grouped by submissionId
    const likesAgg = await LikeModel.aggregate([
      {
        $group: {
          _id: "$submissionId",
          count: { $sum: 1 }
        }
      }
    ]);

    // Get all comments grouped by threadId (submissionId)
    const commentsAgg = await ChatModel.aggregate([
      {
        $match: {
          threadId: { $exists: true }
        }
      },
      {
        $group: {
          _id: "$threadId",
          count: { $sum: 1 }
        }
      }
    ]);

    // Convert to Record format
    const likes: Record<string, number> = {};
    likesAgg.forEach((item) => {
      likes[item._id.toString()] = item.count;
    });

    const comments: Record<string, number> = {};
    commentsAgg.forEach((item) => {
      comments[item._id.toString()] = item.count;
    });

    return res.status(200).json({ likes, comments });
  } catch (error) {
    console.error("Error fetching video stats:", error);
    return res.status(500).json({ error: "Failed to fetch video stats" });
  }
}
