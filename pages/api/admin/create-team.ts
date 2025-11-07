import type { NextApiRequest, NextApiResponse } from 'next'
import { dbConnect } from '../../../lib/dbConnect';
import { TeamModel } from '../../../models/Team';
import { getTeamFromCookie, ADMIN_TEAM_ID } from '../../../lib/team';
import { sha256 } from '../../../lib/hash';
import { z } from 'zod';

const RequestBody = z.object({
  name: z.string(),
  emoji: z.string(),
  teamCode: z.string(),
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

    const { name, emoji, teamCode } = parsed.data;

    // Check if team code already exists
    const existingTeam = await TeamModel.findOne({ teamCode: sha256(teamCode) });
    if (existingTeam) {
      return res.status(400).json({ error: 'Team code already exists' });
    }

    const newTeam = await TeamModel.create({
      name,
      emoji,
      teamCode: sha256(teamCode),
      members: [],
    });

    return res.status(200).json({ team: newTeam });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

