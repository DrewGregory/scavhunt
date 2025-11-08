import type { NextApiRequest, NextApiResponse } from 'next'
import { dbConnect } from '../../lib/dbConnect';
import { isAdminTeam, getTeamFromCookie } from '../../lib/team';

import { z } from "zod";
import { SubmissionModel } from '../../models/Submission';
import { Types } from 'mongoose';

const requestBodySchema = z.object({
  submissionId: z.string(), 
  accepted: z.boolean().optional(),
  rejected: z.boolean().optional(),
});

type ResponseData = {
  success: boolean
} | {
  error: string;
}
 
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  await dbConnect();
  
  const team = await getTeamFromCookie(req.cookies);
  if (team == null) {
    return res.status(400).json({ error: "Not signed in "});
  }

  const teamId = team?._id.toHexString();
  if (!isAdminTeam(teamId)) {
    return res.status(400).json({ error: "Insufficient team permisison to approve submissions" });
  }
  
  const parsedReq = requestBodySchema.safeParse(JSON.parse(req.body));
  if (!parsedReq.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const { submissionId, accepted, rejected } = parsedReq.data;

  // Determine the update based on the request
  let update: { accepted: boolean; rejected: boolean };
  
  if (accepted === true) {
    // Approve submission
    update = { accepted: true, rejected: false };
  } else if (rejected === true) {
    // Reject submission
    update = { accepted: false, rejected: true };
  } else {
    // Reset to pending (both false)
    update = { accepted: false, rejected: false };
  }

  await SubmissionModel.findOneAndUpdate(
    { _id: new Types.ObjectId(submissionId) },
    update
  ).exec();

  return res.status(200).json({
    success: true,
  })
}