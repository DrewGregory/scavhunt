import type { NextApiRequest, NextApiResponse } from "next";
import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
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
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
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
    const cmd = new AbortMultipartUploadCommand({
      Bucket: spaces.bucket,
      Key: key,
      UploadId: uploadId,
    });
    await spaces.client.send(cmd);
    void logServerEvent({
      type: "multipart_aborted",
      userId: user.id,
      teamId: user.teamId,
      attemptId,
      meta: { key },
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("s3 multipart abort error", err);
    void logServerEvent({
      type: "multipart_aborted",
      level: "error",
      userId: user.id,
      teamId: user.teamId,
      attemptId,
      errorMessage: err instanceof Error ? err.message : String(err),
      meta: { key },
    });
    return res.status(500).json({ error: "Failed to abort multipart upload" });
  }
}
