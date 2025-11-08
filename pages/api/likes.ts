import type { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../lib/dbConnect";
import { getTeamFromCookie } from "../../lib/team";
import { LikeModel } from "../../models/Like";
import { Types } from "mongoose";
import { z } from "zod";

const likeRequestSchema = z.object({
  submissionId: z.string(),
});

type GetResponseData =
  | {
      likes: number;
    }
  | {
      error: string;
    };

type PostResponseData =
  | {
      success: boolean;
      likes: number;
    }
  | {
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponseData | PostResponseData>
) {
  await dbConnect();

  const team = await getTeamFromCookie(req.cookies);
  if (team == null) {
    return res.status(401).json({ error: "Not signed in" });
  }

  if (req.method === "GET") {
    const submissionId = req.query.submissionId as string | undefined;
    if (!submissionId) {
      return res.status(400).json({ error: "submissionId is required" });
    }

    const likes = await LikeModel.countDocuments({
      submissionId: new Types.ObjectId(submissionId),
    });

    return res.status(200).json({ likes });
  } else if (req.method === "POST") {
    const parsedReq = likeRequestSchema.safeParse(
      typeof req.body === "string" ? JSON.parse(req.body) : req.body
    );
    if (!parsedReq.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { submissionId } = parsedReq.data;

    // Create a new like (infinite likes allowed)
    await LikeModel.create({
      teamId: team._id,
      submissionId: new Types.ObjectId(submissionId),
      createdAt: new Date(),
    });

    // Get the updated like count
    const likes = await LikeModel.countDocuments({
      submissionId: new Types.ObjectId(submissionId),
    });

    return res.status(200).json({
      success: true,
      likes,
    });
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
