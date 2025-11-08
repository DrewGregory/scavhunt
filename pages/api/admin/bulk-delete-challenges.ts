import { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "../../../lib/dbConnect";
import { ChallengeModel } from "../../../models/Challenge";
import { SubmissionModel } from "../../../models/Submission";
import { getTeamFromCookie, isAdminTeam } from "../../../lib/team";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await dbConnect();

  // Check admin authorization
  const team = await getTeamFromCookie(req.cookies);
  if (!team || !isAdminTeam(team._id.toString())) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    // Get all challenges
    const allChallenges = await ChallengeModel.find({});

    const challengesToDelete = [];
    const challengesWithSubmissions = [];

    // Check each challenge for submissions
    for (const challenge of allChallenges) {
      const submissionCount = await SubmissionModel.countDocuments({
        challengeId: challenge._id,
      });

      if (submissionCount === 0) {
        challengesToDelete.push(challenge._id);
      } else {
        challengesWithSubmissions.push({
          title: challenge.title,
          submissionCount,
        });
      }
    }

    // Delete challenges with no submissions
    if (challengesToDelete.length > 0) {
      await ChallengeModel.deleteMany({
        _id: { $in: challengesToDelete },
      });
    }

    return res.status(200).json({
      message: `Successfully deleted ${challengesToDelete.length} challenge(s) with no submissions.`,
      deletedCount: challengesToDelete.length,
      skippedCount: challengesWithSubmissions.length,
      skippedChallenges: challengesWithSubmissions,
    });
  } catch (error) {
    console.error("Error bulk deleting challenges:", error);
    return res.status(500).json({ error: "Failed to bulk delete challenges" });
  }
}

