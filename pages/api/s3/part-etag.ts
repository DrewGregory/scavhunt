import type { NextApiRequest, NextApiResponse } from "next";
import { HeadObjectCommand, ListPartsCommand } from "@aws-sdk/client-s3";
import { requireApiUser, requireHuntAccessApi } from "../../../lib/auth";
import { getSpacesConfig } from "../../../lib/s3";

/**
 * Returns an object/part ETag from Spaces via the AWS SDK (server-side).
 *
 * Browsers often cannot read the ETag response header on direct PUTs unless
 * the bucket CORS policy exposes it. Uppy multipart needs ETags to call
 * CompleteMultipartUpload — this endpoint lets the client finish without
 * changing bucket CORS.
 *
 * Query:
 * - key (required)
 * - uploadId + partNumber → ListParts, return that part's ETag
 * - key only → HeadObject ETag (single-PUT uploads)
 */
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

  const { key, uploadId, partNumber } = req.query;
  if (typeof key !== "string" || !key) {
    return res.status(400).json({ error: "Missing key" });
  }

  // Only allow keys that look like our uploads (challenge/team/... or sandbox/user/...).
  const teamPrefix = user.teamId ? `${user.teamId}/` : null;
  const sandboxPrefix = `sandbox/${user.id}/`;
  const looksOurs =
    key.startsWith(sandboxPrefix) ||
    (teamPrefix != null && key.includes(`/${teamPrefix}`)) ||
    (user.isAdmin && key.startsWith("sandbox/"));
  // challengeId/teamId/file — team id is the second segment
  const segments = key.split("/");
  const secondIsTeam = user.teamId != null && segments[1] === user.teamId;
  if (!looksOurs && !secondIsTeam && !user.isAdmin) {
    return res.status(403).json({ error: "Forbidden key" });
  }

  const spaces = getSpacesConfig();
  if (!spaces) {
    return res.status(500).json({ error: "Storage not configured on server" });
  }

  try {
    if (typeof uploadId === "string" && uploadId) {
      const partNum = parseInt(String(partNumber ?? ""), 10);
      if (Number.isNaN(partNum) || partNum < 1) {
        return res.status(400).json({ error: "Invalid partNumber" });
      }
      const listed = await spaces.client.send(
        new ListPartsCommand({
          Bucket: spaces.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
      const match = (listed.Parts ?? []).find((p) => p.PartNumber === partNum);
      if (!match?.ETag) {
        return res.status(404).json({ error: "Part not found yet", partNumber: partNum });
      }
      return res.status(200).json({ etag: match.ETag, partNumber: partNum });
    }

    const head = await spaces.client.send(
      new HeadObjectCommand({ Bucket: spaces.bucket, Key: key }),
    );
    if (!head.ETag) {
      return res.status(404).json({ error: "Object has no ETag" });
    }
    return res.status(200).json({ etag: head.ETag });
  } catch (err) {
    console.error("s3 part-etag error", err);
    return res.status(500).json({ error: "Failed to read ETag" });
  }
}
