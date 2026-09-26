import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../lib/auth";
import { jsonError } from "../../../lib/http";
import { ensureHuntSettings } from "../../../lib/time";
import { PRODUCTION_UPLOAD_CONFIG, mergeUploadConfig } from "../../../lib/upload/config";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method !== "GET") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }
  }

  await ensureHuntSettings();

  if (req.method === "GET") {
    const row = await prisma.huntSettings.findUnique({
      where: { id: "default" },
      select: { uploadConfig: true },
    });
    const overrides = row?.uploadConfig ?? null;
    return res.status(200).json({
      overrides,
      config: mergeUploadConfig(PRODUCTION_UPLOAD_CONFIG, overrides),
      defaults: PRODUCTION_UPLOAD_CONFIG,
    });
  }

  if (req.method === "PUT") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body.config !== "object" || body.config == null) {
      return res.status(400).json({ error: "Missing config" });
    }
    // Store the validated, fully merged config so later code-default changes don't silently apply.
    const config = mergeUploadConfig(PRODUCTION_UPLOAD_CONFIG, body.config);
    await prisma.huntSettings.update({
      where: { id: "default" },
      data: { uploadConfig: config as unknown as Prisma.InputJsonValue },
    });
    return res.status(200).json({ overrides: config, config });
  }

  if (req.method === "DELETE") {
    await prisma.huntSettings.update({
      where: { id: "default" },
      data: { uploadConfig: Prisma.DbNull },
    });
    return res.status(200).json({ overrides: null, config: PRODUCTION_UPLOAD_CONFIG });
  }

  res.setHeader("Allow", "GET, PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
