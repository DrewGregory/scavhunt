import type { NextApiRequest, NextApiResponse } from "next";
import { SubmissionModel } from "../../models/Submission";
import { Types } from "mongoose";
import { dbConnect } from "../../lib/dbConnect";
import { isAdminTeam, getTeamFromCookie } from "../../lib/team";
import { z } from 'zod';

const requestBodySchema = z.object({
  submissionId: z.string(),
});

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await dbConnect();

  // Check if user is signed in
  const team = await getTeamFromCookie(req.cookies);
  if (team == null) {
    return res.status(401).json({ error: "Not signed in" });
  }

  // Check if user is admin (only admins can delete submissions)
  const teamId = team._id.toHexString();
  const isAdmin = isAdminTeam(teamId);
  
  if (!isAdmin) {
    return res.status(403).json({ error: "Forbidden: Only admins can delete submissions" });
  }

  // Parse and validate request body
  const parsedReq = requestBodySchema.safeParse(JSON.parse(req.body));
  if (!parsedReq.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  
  const { submissionId } = parsedReq.data;

  try {
    // Validate submission exists
    const submission = await SubmissionModel.findOne({
      _id: new Types.ObjectId(submissionId),
    })
      .lean()
      .exec();
    
    if (submission == null || Array.isArray(submission)) {
      return res.status(404).json({
        error: `Submission with id '${submissionId}' not found`,
      });
    }

    // Delete the submission
    await SubmissionModel.findByIdAndDelete(new Types.ObjectId(submissionId)).exec();
    
    return res.status(200).json({
      success: true,
      message: "Submission deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting submission:", error);
    return res.status(500).json({
      error: "Failed to delete submission",
    });
  }
};

