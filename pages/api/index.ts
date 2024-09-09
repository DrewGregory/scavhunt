import type { NextApiRequest, NextApiResponse } from 'next'
import { dbConnect } from '../../lib/dbConnect';

type ResponseData = {
  success: boolean
}
 
export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  await dbConnect();
  res.status(200).json({ success: true })
}