import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { assertSameOrigin, requireApiUser } from "../../lib/auth";
import { jsonError } from "../../lib/http";
import { parseJsonBody } from "../../lib/serialize";

const postSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

/** Players send a message to admins (Leave feedback). */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireApiUser(req, res);
  if (!user) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertSameOrigin(req);
  } catch {
    return jsonError(res, "Invalid origin", 403);
  }

  const parsed = postSchema.safeParse(parseJsonBody(req.body) ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || "Message is required",
    });
  }

  try {
    const message = await prisma.message.create({
      data: {
        userId: user.id,
        body: parsed.data.body,
      },
      select: { id: true, createdAt: true },
    });

    return res.status(201).json({
      message: {
        id: message.id,
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("POST /api/messages failed", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Could not send message",
    });
  }
}
