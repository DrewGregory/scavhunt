import type { NextApiRequest, NextApiResponse } from "next";

type ResponseData = {
  success: boolean;
};

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
) {
  res.status(200).json({ success: true });
}
