import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { requireApiAdmin } from "../../../lib/auth";
import { parseJsonBody, serializeChallenge } from "../../../lib/serialize";

/** Empty / null → null (draft, unplaced). Finite number → that value. */
function parseOptionalCoord(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiAdmin(req, res);
  if (!user) return;

  if (req.method === "POST") {
    try {
      const body = parseJsonBody(req.body) as Record<string, unknown>;
      const { title, prompt, pts, numWinners } = body;
      const lat = parseOptionalCoord(body.lat);
      const lng = parseOptionalCoord(body.lng);

      if (!title || !pts || !numWinners) {
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
          lat: lat ?? null,
          lng: lng ?? null,
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
      if (!id) {
        return res.status(400).json({ error: "Missing challenge id" });
      }

      const existing = await prisma.challenge.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: "Challenge not found" });
      }

      const data: {
        title?: string;
        prompt?: string;
        pts?: number;
        lat?: number | null;
        lng?: number | null;
        numWinners?: number;
      } = {};

      if (body.title !== undefined) {
        const title = String(body.title).trim();
        if (!title) {
          return res.status(400).json({ error: "Title cannot be empty" });
        }
        data.title = title;
      }
      if (body.prompt !== undefined) data.prompt = String(body.prompt);
      if (body.pts !== undefined) {
        const pts = Number(body.pts);
        if (!Number.isFinite(pts) || pts <= 0) {
          return res.status(400).json({ error: "Invalid points" });
        }
        data.pts = pts;
      }
      if (body.numWinners !== undefined) {
        const numWinners = Number(body.numWinners);
        if (!Number.isFinite(numWinners) || numWinners < 1) {
          return res.status(400).json({ error: "Invalid winners" });
        }
        data.numWinners = numWinners;
      }
      if (body.lat !== undefined || body.lng !== undefined) {
        // lat/lng edited together — missing side becomes null
        data.lat =
          body.lat !== undefined
            ? (parseOptionalCoord(body.lat) ?? null)
            : existing.lat;
        data.lng =
          body.lng !== undefined
            ? (parseOptionalCoord(body.lng) ?? null)
            : existing.lng;
        if (body.lat !== undefined && body.lng === undefined && body.lat === null) {
          data.lng = null;
        }
        if (body.lng !== undefined && body.lat === undefined && body.lng === null) {
          data.lat = null;
        }
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const challenge = await prisma.challenge.update({
        where: { id },
        data,
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
