import type { NextApiRequest, NextApiResponse } from 'next'
import { dbConnect } from '../../../lib/dbConnect';
import { TeamModel } from '../../../models/Team';
import { getTeamFromCookie, isAdminTeam } from '../../../lib/team';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await dbConnect();
  
  // Check if user is admin
  const team = await getTeamFromCookie(req.cookies);
  if (team == null || !isAdminTeam(team._id.toString())) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    // Get all teams
    const teams = await TeamModel.find({}).lean().exec();
    return res.status(200).json({ teams });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

