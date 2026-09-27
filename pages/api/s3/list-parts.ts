import type { NextApiRequest, NextApiResponse } from "next";
import { ListPartsCommand } from "@aws-sdk/client-s3";
import { requireApiUser, requireHuntAccessApi } from "../../../lib/auth";
import { getSpacesConfig } from "../../../lib/s3";
import {
  attemptIdFromHeaders,
  logServerEvent,
} from "../../../lib/serverTelemetry";

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

  if (!(await requireHuntAccessApi(res, user))) return;

  const { uploadId, key } = req.query;
  if (typeof uploadId !== "string" || typeof key !== "string") {
    return res.status(400).json({ error: "Missing uploadId or key" });
  }

  const spaces = getSpacesConfig();
  if (!spaces) {
    return res.status(500).json({ error: "Storage not configured on server" });
  }

  const attemptId = attemptIdFromHeaders(req.headers);
  try {
    const cmd = new ListPartsCommand({
      Bucket: spaces.bucket,
      Key: key,
      UploadId: uploadId,
    });
    const result = await spaces.client.send(cmd);
    const parts = (result.Parts ?? []).map((p) => ({
      PartNumber: p.PartNumber,
      Size: p.Size,
      ETag: p.ETag,
    }));
    void logServerEvent({
      type: "multipart_list_parts",
      userId: user.id,
      teamId: user.teamId,
      attemptId,
      meta: { key, parts: parts.length },
    });
    return res.status(200).json({ parts });
  } catch (err) {
    console.error("s3 multipart list-parts error", err);
    void logServerEvent({
      type: "multipart_list_parts",
      level: "error",
      userId: user.id,
      teamId: user.teamId,
      attemptId,
      errorMessage: err instanceof Error ? err.message : String(err),
      meta: { key },
    });
    return res.status(500).json({ error: "Failed to list parts" });
  }
}
