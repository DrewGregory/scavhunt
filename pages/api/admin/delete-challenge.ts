import { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../../lib/dbConnect";
import { ChallengeModel } from "../../../models/Challenge";
import { SubmissionModel } from "../../../models/Submission";
import { TeamModel } from "../../../models/Team";
import { isAdminTeam } from "../../../lib/team";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await dbConnect();

  // Check admin authorization
  const teamCode = req.cookies.teamCode;
  if (!teamCode) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const team = await TeamModel.findOne({ teamCode });
  if (!team || !isAdminTeam(team._id.toString())) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const { challengeId } = req.body;

    if (!challengeId) {
      return res.status(400).json({ error: "Challenge ID is required" });
    }

    // Check if the challenge exists
    const challenge = await ChallengeModel.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    // Check if there are any submissions for this challenge
    const submissionCount = await SubmissionModel.countDocuments({
      challengeId: challengeId,
    });

    if (submissionCount > 0) {
      return res.status(400).json({
        error: `Cannot delete challenge. There are ${submissionCount} submission(s) associated with this challenge.`,
      });
    }

    // Delete the challenge
    await ChallengeModel.findByIdAndDelete(challengeId);

    return res.status(200).json({
      message: "Challenge deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting challenge:", error);
    return res.status(500).json({ error: "Failed to delete challenge" });
  }
}

