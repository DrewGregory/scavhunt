import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../../lib/auth";
import { jsonError } from "../../../../lib/http";
import { getSpacesConfig } from "../../../../lib/s3";
import { serializeUploadTestRun } from "../../../../lib/uploadTesting/storage";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  const run = id
    ? await prisma.uploadTestRun.findFirst({ where: { id, deletedAt: null } })
    : null;
  if (!run) return res.status(404).json({ error: "Not found" });

  if (req.method === "GET") {
    return res.status(200).json({ run: serializeUploadTestRun(run, getSpacesConfig()) });
  }

  if (req.method === "DELETE") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }
    await prisma.uploadTestRun.update({ where: { id }, data: { deletedAt: new Date() } });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
