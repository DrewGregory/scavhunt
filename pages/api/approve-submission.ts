import type { NextApiRequest, NextApiResponse } from 'next'
import { dbConnect } from '../../lib/dbConnect';
import { ADMIN_TEAM_ID, getTeamFromCookie } from '../../lib/team';

import { z } from "zod";
import { SubmissionModel } from '../../models/Submission';
import { Types } from 'mongoose';

const requestBodySchema = z.object({
  submissionId: z.string(), 
  accepted: z.boolean().optional(),
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
  if (teamId !== ADMIN_TEAM_ID) {
    return res.status(400).json({ error: "Insufficient team permisison to approve submissions" });
  }
  
  const parsedReq = requestBodySchema.safeParse(JSON.parse(req.body));
  if (!parsedReq.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const { submissionId, accepted } = parsedReq.data;

  if (accepted === undefined || accepted) {
    await SubmissionModel.findOneAndUpdate({
      _id: new Types.ObjectId(submissionId),
    }, {
      accepted: true,
    }).exec();
  } else if (accepted === false) {
    await SubmissionModel.findOneAndUpdate({
      _id: new Types.ObjectId(submissionId),
    }, {
      rejected: true,
    }).exec();
  }
  return res.status(200).json({
    success: true,
  })
}