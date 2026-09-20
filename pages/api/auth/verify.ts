import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { normalizeEmail, normalizePhone } from "../../../lib/phone";
import { birdCheckOtp } from "../../../lib/bird";
import {
  adminEmailsFromEnv,
  assertSameOrigin,
  setSessionCookie,
} from "../../../lib/auth";
import { createSessionToken } from "../../../lib/session";
import {
  genericAuthError,
  jsonError,
  unrecognizedAuthError,
} from "../../../lib/http";
import type { User } from "@prisma/client";

const bodySchema = z.object({
  phone: z.string().min(3).optional(),
  email: z.string().min(3).optional(),
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

  const channel =
    parsed.data.channel === "email" ||
    (!parsed.data.phone && parsed.data.email)
      ? "email"
      : "sms";

  let user: User | null = null;
  if (channel === "email") {
    const email = parsed.data.email
      ? normalizeEmail(parsed.data.email)
      : null;
    if (!email) return genericAuthError(res);
    user = await prisma.user.findUnique({ where: { email } });
  } else {
    const phoneE164 = parsed.data.phone
      ? normalizePhone(parsed.data.phone)
      : null;
    if (!phoneE164) return genericAuthError(res);
    user = await prisma.user.findUnique({ where: { phoneE164 } });
  }

  if (!user || !user.isActive) {
    return unrecognizedAuthError(res, channel === "email" ? "email" : "phone");
  }

  let result: { success: boolean; reason?: string };
  try {
    if (channel === "email") {
      result = await birdCheckOtp(
        { kind: "email", email: user.email },
        parsed.data.code,
      );
    } else {
      result = await birdCheckOtp(
        { kind: "sms", phoneE164: user.phoneE164 },
        parsed.data.code,
      );
    }
  } catch (err) {
    console.error(err);
    return jsonError(res, "Could not verify code. Try again shortly.", 502);
  }

  if (!result.success) return genericAuthError(res);

  if (adminEmailsFromEnv().has(user.email) && !user.isAdmin) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isAdmin: true },
    });
  }

  const token = createSessionToken(user.id);
  setSessionCookie(res, token);
  return res.status(200).json({ ok: true });
}
