import type { NextApiRequest, NextApiResponse } from "next";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { randomBytes } from "crypto";
import { requireApiUser, requireHuntAccessApi } from "../../../lib/auth";
import { getSpacesConfig } from "../../../lib/s3";

function sanitizeSegment(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireApiUser(req, res);
  if (!user) return;

  if (!(await requireHuntAccessApi(res, user))) return;

  const { challengeId, filename, contentType, sandbox, runId, label } =
    req.body ?? {};
  const isSandbox = sandbox === true;

  if (isSandbox) {
    if (!user.isAdmin) {
      return res.status(403).json({ error: "Sandbox uploads are admin-only" });
    }
    if (!sanitizeSegment(runId) || !sanitizeSegment(label)) {
      return res.status(400).json({ error: "Missing runId or label" });
    }
  } else {
    if (!user.teamId) {
      return res.status(400).json({ error: "You must be on a team to upload" });
    }
    if (!challengeId || typeof challengeId !== "string") {
      return res.status(400).json({ error: "Missing or invalid challengeId" });
    }
  }

  const spaces = getSpacesConfig();
  if (!spaces) {
    return res.status(500).json({ error: "Storage not configured on server" });
  }

  const extFromFilename =
    typeof filename === "string" ? filename.split(".").pop() : undefined;
  const fileExt = extFromFilename ?? "";
  if (!fileExt) {
    return res
      .status(400)
      .json({ error: "Missing file extension (provide filename)" });
  }

  let key: string;
  if (isSandbox) {
    const safeExt = fileExt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase();
    if (!safeExt) {
      return res.status(400).json({ error: "Invalid file extension" });
    }
    key = `sandbox/${user.id}/${sanitizeSegment(runId)}/${sanitizeSegment(label)}.${safeExt}`;
  } else {
    key = `${challengeId}/${user.teamId}/${randomBytes(8).toString("hex")}.${fileExt}`;
  }

  try {
    const cmd = new CreateMultipartUploadCommand({
      Bucket: spaces.bucket,
      Key: key,
      ContentType: contentType ?? "application/octet-stream",
      // Keys are random and never overwritten, so objects can be cached forever.
      CacheControl: "public, max-age=31536000, immutable",
    });
    const result = await spaces.client.send(cmd);
    return res.status(200).json({
      uploadId: result.UploadId,
      key,
    });
  } catch (err) {
    console.error("s3 multipart create error", err);
    return res.status(500).json({ error: "Failed to create multipart upload" });
  }
}
