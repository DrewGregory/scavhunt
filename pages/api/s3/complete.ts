import type { NextApiRequest, NextApiResponse } from "next";
import { CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import { requireApiUser } from "../../../lib/auth";
import { requireHuntStartedApi } from "../../../lib/time";
import { getSpacesConfig } from "../../../lib/s3";

type Part = {
  PartNumber: number;
  ETag: string;
};

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

  if (!(await requireHuntStartedApi(res, user.isAdmin))) return;

  const { uploadId, key, parts } = req.body ?? {};
  if (
    typeof uploadId !== "string" ||
    typeof key !== "string" ||
    !Array.isArray(parts)
  ) {
    return res.status(400).json({ error: "Missing uploadId, key, or parts" });
  }

  const spaces = getSpacesConfig();
  if (!spaces) {
    return res.status(500).json({ error: "Storage not configured on server" });
  }

  try {
    const cmd = new CompleteMultipartUploadCommand({
      Bucket: spaces.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p: Part) => ({
          PartNumber: p.PartNumber,
          ETag: p.ETag,
        })),
      },
    });
    await spaces.client.send(cmd);
    return res.status(200).json({ location: spaces.publicUrl(key) });
  } catch (err) {
    console.error("s3 multipart complete error", err);
    return res
      .status(500)
      .json({ error: "Failed to complete multipart upload" });
  }
}
