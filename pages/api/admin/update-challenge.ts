import { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../../lib/dbConnect";
import { ChallengeModel } from "../../../models/Challenge";
import { verifyAdminTeamCode } from "../../../lib/team";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await dbConnect();

  const teamCode = req.cookies.teamCode;
  if (!teamCode || !(await verifyAdminTeamCode(teamCode))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method === "PUT") {
    try {
      const body = JSON.parse(req.body);
      const { _id, title, prompt, pts, lat, lng, numWinners } = body;

      if (!_id || !title || prompt === undefined || !pts || lat === undefined || lng === undefined || numWinners === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const challenge = await ChallengeModel.findByIdAndUpdate(
        _id,
        {
          title,
          prompt,
          pts: Number(pts),
          loc: {
            lat: Number(lat),
            lng: Number(lng),
          },
          numWinners: Number(numWinners),
        },
        { new: true }
      );

      if (!challenge) {
        return res.status(404).json({ error: "Challenge not found" });
      }

      return res.status(200).json({ 
        success: true,
        challenge: {
          _id: challenge._id.toString(),
          title: challenge.title,
          prompt: challenge.prompt,
          pts: challenge.pts,
          loc: challenge.loc,
          numWinners: challenge.numWinners,
        }
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to update challenge" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

