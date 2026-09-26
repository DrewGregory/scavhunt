import type { NextApiRequest, NextApiResponse } from "next";
import { requireApiUser } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import {
  PRODUCTION_UPLOAD_CONFIG,
  mergeUploadConfig,
} from "../../lib/upload/config";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireApiUser(req, res);
  if (!user) return;

  try {
    const settings = await prisma.huntSettings.findUnique({
      where: { id: "default" },
      select: { uploadConfig: true },
    });
    const config = mergeUploadConfig(
      PRODUCTION_UPLOAD_CONFIG,
      settings?.uploadConfig ?? null,
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ config });
  } catch (err) {
    console.error("upload-config error", err);
    return res.status(200).json({ config: PRODUCTION_UPLOAD_CONFIG });
  }
}
