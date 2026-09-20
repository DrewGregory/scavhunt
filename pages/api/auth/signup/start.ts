import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { normalizeEmail, normalizePhone } from "../../../../lib/phone";
import { BirdError, birdSendOtp, formatWait } from "../../../../lib/bird";
import { assertSameOrigin } from "../../../../lib/auth";
import { genericAuthError, jsonError } from "../../../../lib/http";

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().min(3),
  phone: z.string().min(3),
  channel: z.enum(["sms", "email"]).optional(),
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

  const channel =
    parsed.data.channel === "email" ? "email" : ("sms" as const);

  try {
    if (channel === "email") {
      await birdSendOtp({ kind: "email", email }, randomUUID());
    } else {
      await birdSendOtp({ kind: "sms", phoneE164 }, randomUUID());
    }
  } catch (err) {
    console.error(err);
    if (err instanceof BirdError && err.status === 429) {
      const wait = err.retryAfterSeconds
        ? `Try again in ${formatWait(err.retryAfterSeconds)}.`
        : "Try again in a minute.";
      return res.status(429).json({
        error: `Too many codes sent. ${wait}`,
        emailFallback: channel === "sms",
        retryAfterSeconds: err.retryAfterSeconds,
      });
    }
    if (channel === "sms") {
      return res.status(502).json({
        error:
          "Text didn’t go through. Try email instead, or try again shortly.",
        emailFallback: true,
      });
    }
    return jsonError(res, "Could not send a code. Try again shortly.", 502);
  }

  return res.status(200).json({ ok: true, channel });
}
