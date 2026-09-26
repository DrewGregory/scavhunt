import type { NextApiRequest, NextApiResponse } from "next";
import { ListPartsCommand } from "@aws-sdk/client-s3";
import { requireApiUser } from "../../../lib/auth";
import { requireHuntStartedApi } from "../../../lib/time";
import { getSpacesConfig } from "../../../lib/s3";

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

  if (!(await requireHuntStartedApi(res, user.isAdmin))) return;

  const { uploadId, key } = req.query;
  if (typeof uploadId !== "string" || typeof key !== "string") {
    return res.status(400).json({ error: "Missing uploadId or key" });
  }

  const spaces = getSpacesConfig();
  if (!spaces) {
    return res.status(500).json({ error: "Storage not configured on server" });
  }

  try {
    const cmd = new ListPartsCommand({
      Bucket: spaces.bucket,
      Key: key,
      UploadId: uploadId,
    });
    const result = await spaces.client.send(cmd);
    return res.status(200).json({
      parts: (result.Parts ?? []).map((p) => ({
        PartNumber: p.PartNumber,
        Size: p.Size,
        ETag: p.ETag,
      })),
    });
  } catch (err) {
    console.error("s3 multipart list-parts error", err);
    return res.status(500).json({ error: "Failed to list parts" });
  }
}
