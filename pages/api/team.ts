import type { NextApiRequest, NextApiResponse } from 'next'
import { dbConnect } from '../../lib/dbConnect';
import { Team } from '../../models/Team';
import { LocationModel } from '../../models/Location';
import { differenceInMinutes} from "date-fns";
import { z } from "zod";
import { getTeamFromCookie } from '../../lib/team';
type ResponseData = {
  team: Team | null
}

const RequestBody = z.object({
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }).optional(),
})
 
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  await dbConnect();
  const team = await getTeamFromCookie(req.cookies)
  if (team == null) {
    res.status(200).json({ team: null });
    return;
  }
  

  const parsedReq = RequestBody.safeParse(JSON.parse(req.body))
  if (parsedReq.success) {
    const {location} = parsedReq.data; 
    if (location != null) {
      const teamId = team._id;
      const latestLocation = await LocationModel.findOne({
        teamId,
      }).sort({ createdAt: -1 });
      if (latestLocation == null || differenceInMinutes(new Date(), latestLocation.createdAt) >= 15) {
        await LocationModel.create({
          teamId,
          loc: location,
          createdAt: new Date(),
        })
      }
    } 
    
  }
  
  res.status(200).json({ team });
}