import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { normalizeEmail, normalizePhone } from "../../../../lib/phone";
import { birdCheckOtp } from "../../../../lib/bird";
import {
  adminEmailsFromEnv,
  assertSameOrigin,
  setSessionCookie,
} from "../../../../lib/auth";
import { createSessionToken } from "../../../../lib/session";
import { genericAuthError, jsonError } from "../../../../lib/http";

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().min(3),
  phone: z.string().min(3),
  channel: z.enum(["sms", "email"]).optional(),
  code: z.string().min(4).max(10),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertSameOrigin(req);
  } catch {
    return jsonError(res, "Invalid origin", 403);
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return genericAuthError(res);

  const email = normalizeEmail(parsed.data.email);
  const phoneE164 = normalizePhone(parsed.data.phone);
  if (!email || !phoneE164) return genericAuthError(res);

  const name = parsed.data.name.trim();
  if (!name) return genericAuthError(res);

  const channel =
    parsed.data.channel === "email" ? "email" : ("sms" as const);

  let result: { success: boolean; reason?: string };
  try {
    if (channel === "email") {
      result = await birdCheckOtp({ kind: "email", email }, parsed.data.code);
    } else {
      result = await birdCheckOtp(
        { kind: "sms", phoneE164 },
        parsed.data.code,
      );
    }
  } catch (err) {
    console.error(err);
    return jsonError(res, "Could not verify code. Try again shortly.", 502);
  }

  if (!result.success) return genericAuthError(res);

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { phoneE164 }] },
  });
  if (existing) {
    return jsonError(
      res,
      "An account with that email or phone already exists. Log in instead.",
      409,
    );
  }

  const isAdmin = adminEmailsFromEnv().has(email);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      phoneE164,
      isAdmin,
      isActive: true,
    },
  });

  const token = createSessionToken(user.id);
  setSessionCookie(res, token);
  return res.status(200).json({ ok: true });
}
