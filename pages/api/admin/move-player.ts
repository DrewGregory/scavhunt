import type { NextApiRequest, NextApiResponse } from 'next'
import { dbConnect } from '../../../lib/dbConnect';
import { TeamModel } from '../../../models/Team';
import { getTeamFromCookie, isAdminTeam } from '../../../lib/team';
import { z } from 'zod';

const RequestBody = z.object({
  fromTeamId: z.string(),
  toTeamId: z.string(),
  playerIndex: z.number(), // Index of the player in the members array
});

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

  if (req.method === 'POST') {
    const parsed = RequestBody.safeParse(JSON.parse(req.body));
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const { fromTeamId, toTeamId, playerIndex } = parsed.data;

    // Get the source team
    const fromTeam = await TeamModel.findById(fromTeamId);
    if (!fromTeam) {
      return res.status(404).json({ error: 'Source team not found' });
    }

    if (playerIndex < 0 || playerIndex >= fromTeam.members.length) {
      return res.status(400).json({ error: 'Invalid player index' });
    }

    // Get the player
    const player = fromTeam.members[playerIndex];

    // Add player to destination team
    await TeamModel.findByIdAndUpdate(
      toTeamId,
      { $push: { members: player } }
    );

    // Remove player from source team
    await TeamModel.findByIdAndUpdate(
      fromTeamId,
      { $pull: { members: { firstName: player.firstName, familyName: player.familyName } } }
    );

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

