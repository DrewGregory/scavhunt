import type { NextApiRequest, NextApiResponse } from "next";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { assertSameOrigin, requireApiAdmin } from "../../../../lib/auth";
import { jsonError } from "../../../../lib/http";
import { getSpacesConfig } from "../../../../lib/s3";
import { parseUserAgent } from "../../../../lib/userAgent";
import { serializeUploadTestRun } from "../../../../lib/uploadTesting/storage";

const MAX_JSON_BYTES = 256 * 1024;

function sandboxKey(userId: string) {
  return z
    .string()
    .max(1024)
    .refine((k) => k.startsWith(`sandbox/${userId}/`) && !k.includes(".."), "Invalid key")
    .nullish();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireApiAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const runs = await prisma.uploadTestRun.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const spaces = getSpacesConfig();
    return res.status(200).json({ runs: runs.map((r) => serializeUploadTestRun(r, spaces)) });
  }

  if (req.method === "POST") {
    try {
      assertSameOrigin(req);
    } catch {
      return jsonError(res, "Invalid origin", 403);
    }
    const schema = z.object({
      fileName: z.string().max(255).nullish(),
      connection: z.string().max(64).nullish(),
      deviceLabel: z.string().max(128).nullish(),
      settings: z.record(z.unknown()),
      metrics: z.record(z.unknown()),
      originalKey: sandboxKey(admin.id),
      compressedKey: sandboxKey(admin.id),
      posterKey: sandboxKey(admin.id),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    }
    const d = parsed.data;
    if (JSON.stringify(d.settings).length + JSON.stringify(d.metrics).length > MAX_JSON_BYTES) {
      return res.status(413).json({ error: "settings/metrics too large" });
    }
    const ua = parseUserAgent(req.headers["user-agent"]);
    const deviceLabel = d.deviceLabel || `${ua.platform} · ${ua.browser}`;
    const run = await prisma.uploadTestRun.create({
      data: {
        userId: admin.id,
        deviceLabel,
        connection: d.connection ?? null,
        fileName: d.fileName ?? null,
        settings: d.settings as Prisma.InputJsonValue,
        metrics: d.metrics as Prisma.InputJsonValue,
        originalKey: d.originalKey ?? null,
        compressedKey: d.compressedKey ?? null,
        posterKey: d.posterKey ?? null,
      },
    });
    return res.status(201).json({ run: serializeUploadTestRun(run, getSpacesConfig()) });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
