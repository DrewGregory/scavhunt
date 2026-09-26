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

function parseOptionalEnabled(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
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
      const enabled = parseOptionalEnabled(body.enabled) ?? true;
      const emoji =
        body.emoji === undefined
          ? undefined
          : body.emoji === null || String(body.emoji).trim() === ""
            ? null
            : String(body.emoji).trim();

      if (!title || pts == null || numWinners == null) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const ptsN = Number(pts);
      const winnersN = Number(numWinners);
      if (!Number.isFinite(ptsN) || ptsN <= 0) {
        return res.status(400).json({ error: "Invalid points" });
      }
      if (!Number.isFinite(winnersN) || winnersN < 1) {
        return res.status(400).json({ error: "Invalid winners" });
      }

      const existing = await prisma.challenge.findFirst({
        where: { title: String(title).trim(), deletedAt: null },
      });
      if (existing) {
        return res
          .status(409)
          .json({ error: "A challenge with this title already exists" });
      }

      const challenge = await prisma.challenge.create({
        data: {
          title: String(title).trim(),
          prompt: String(prompt || " "),
          emoji: emoji === undefined ? null : emoji,
          pts: ptsN,
          lat: lat ?? null,
          lng: lng ?? null,
          numWinners: winnersN,
          enabled,
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
        emoji?: string | null;
        pts?: number;
        lat?: number | null;
        lng?: number | null;
        numWinners?: number;
        enabled?: boolean;
      } = {};

      if (body.title !== undefined) {
        const title = String(body.title).trim();
        if (!title) {
          return res.status(400).json({ error: "Title cannot be empty" });
        }
        data.title = title;
      }
      if (body.prompt !== undefined) data.prompt = String(body.prompt);
      if (body.emoji !== undefined) {
        data.emoji =
          body.emoji === null || String(body.emoji).trim() === ""
            ? null
            : String(body.emoji).trim();
      }
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
      const enabled = parseOptionalEnabled(body.enabled);
      if (enabled !== undefined) data.enabled = enabled;

      if (body.lat !== undefined || body.lng !== undefined) {
        data.lat =
          body.lat !== undefined
            ? (parseOptionalCoord(body.lat) ?? null)
            : existing.lat;
        data.lng =
          body.lng !== undefined
            ? (parseOptionalCoord(body.lng) ?? null)
            : existing.lng;
        if (
          body.lat !== undefined &&
          body.lng === undefined &&
          body.lat === null
        ) {
          data.lng = null;
        }
        if (
          body.lng !== undefined &&
          body.lat === undefined &&
          body.lng === null
        ) {
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
