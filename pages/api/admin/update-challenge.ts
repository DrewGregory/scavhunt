import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody, serializeChallenge } from "../../../lib/serialize";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiAdmin(req, res);
  if (!user) return;

  if (req.method === "PUT") {
    try {
      const body = parseJsonBody(req.body) as Record<string, unknown>;
      const id = (body.id ?? body._id) as string | undefined;
      const { title, prompt, pts, lat, lng, numWinners } = body;

      if (
        !id ||
        !title ||
        prompt === undefined ||
        !pts ||
        lat === undefined ||
        lng === undefined ||
        numWinners === undefined
      ) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const challenge = await prisma.challenge.update({
        where: { id },
        data: {
          title: String(title),
          prompt: String(prompt),
          pts: Number(pts),
          lat: Number(lat),
          lng: Number(lng),
          numWinners: Number(numWinners),
        },
      });

      return res.status(200).json({
        success: true,
        challenge: serializeChallenge(challenge),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to update challenge" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
