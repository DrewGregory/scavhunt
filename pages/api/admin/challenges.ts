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

  if (req.method === "GET") {
    try {
      const challenges = await ChallengeModel.find({}).lean().exec();
      return res.status(200).json({ 
        challenges: challenges.map(c => ({
          _id: c._id.toString(),
          title: c.title,
          prompt: c.prompt,
          pts: c.pts,
          loc: c.loc,
          numWinners: c.numWinners,
        }))
      });
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch challenges" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

