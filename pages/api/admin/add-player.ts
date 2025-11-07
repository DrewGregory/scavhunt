import type { NextApiRequest, NextApiResponse } from 'next'
import { dbConnect } from '../../../lib/dbConnect';
import { TeamModel } from '../../../models/Team';
import { getTeamFromCookie, ADMIN_TEAM_ID } from '../../../lib/team';
import { z } from 'zod';

const RequestBody = z.object({
  teamId: z.string(),
  firstName: z.string(),
  familyName: z.string(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await dbConnect();
  
  // Check if user is admin
  const team = await getTeamFromCookie(req.cookies);
  if (team == null || team._id.toString() !== ADMIN_TEAM_ID) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    const parsed = RequestBody.safeParse(JSON.parse(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const { teamId, firstName, familyName } = parsed.data;

    const updatedTeam = await TeamModel.findByIdAndUpdate(
      teamId,
      { 
        $push: { 
          members: { firstName, familyName } 
        } 
      },
      { new: true }
    );

    if (!updatedTeam) {
      return res.status(404).json({ error: 'Team not found' });
    }

    return res.status(200).json({ team: updatedTeam });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

