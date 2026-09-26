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

  if (req.method === "POST") {
    try {
      const body = parseJsonBody(req.body) as Record<string, unknown>;
      const { title, prompt, pts, lat, lng, numWinners } = body;

      if (!title || !pts || lat === undefined || lng === undefined || !numWinners) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const existing = await prisma.challenge.findFirst({
        where: { title: String(title) },
      });
      if (existing) {
        return res
          .status(409)
          .json({ error: "A challenge with this title already exists" });
      }

      const challenge = await prisma.challenge.create({
        data: {
          title: String(title),
          prompt: String(prompt || " "),
          pts: Number(pts),
          lat: Number(lat),
          lng: Number(lng),
          numWinners: Number(numWinners),
        },
      });

      return res.status(201).json({
        success: true,
        challenge: serializeChallenge(challenge),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to create challenge" });
    }
  }

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
