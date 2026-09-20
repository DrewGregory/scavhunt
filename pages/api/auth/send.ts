import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { normalizeEmail, normalizePhone } from "../../../lib/phone";
import { BirdError, birdSendOtp, formatWait } from "../../../lib/bird";
import { assertSameOrigin } from "../../../lib/auth";
import {
  genericAuthError,
  jsonError,
  unrecognizedAuthError,
} from "../../../lib/http";

const bodySchema = z.object({
  phone: z.string().min(3).optional(),
  email: z.string().min(3).optional(),
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

  const channel =
    parsed.data.channel === "email" ||
    (!parsed.data.phone && parsed.data.email)
      ? "email"
      : "sms";

  if (channel === "email") {
    const email = parsed.data.email
      ? normalizeEmail(parsed.data.email)
      : null;
    if (!email) return genericAuthError(res);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return unrecognizedAuthError(res, "email");
    }

    try {
      await birdSendOtp({ kind: "email", email }, randomUUID());
    } catch (err) {
      console.error(err);
      if (err instanceof BirdError && err.status === 429) {
        const wait = err.retryAfterSeconds
          ? `Try again in ${formatWait(err.retryAfterSeconds)}.`
          : "Try again in a minute.";
        return jsonError(
          res,
          `Too many codes sent to this email. ${wait}`,
          429,
        );
      }
      return jsonError(
        res,
        "Could not send a code to that email. Try again shortly.",
        502,
      );
    }

    return res.status(200).json({ ok: true, channel: "email" });
  }

  const phoneE164 = parsed.data.phone
    ? normalizePhone(parsed.data.phone)
    : null;
  if (!phoneE164) return genericAuthError(res);

  const user = await prisma.user.findUnique({ where: { phoneE164 } });
  if (!user || !user.isActive) {
    return unrecognizedAuthError(res, "phone");
  }

  try {
    await birdSendOtp({ kind: "sms", phoneE164 }, randomUUID());
  } catch (err) {
    console.error(err);
    if (err instanceof BirdError && err.status === 429) {
      const wait = err.retryAfterSeconds
        ? `Try again in ${formatWait(err.retryAfterSeconds)}.`
        : "Try again in a minute.";
      return res.status(429).json({
        error: `Too many codes sent to this number. ${wait}`,
        emailFallback: true,
        retryAfterSeconds: err.retryAfterSeconds,
      });
    }
    return res.status(502).json({
      error:
        "Text didn’t go through. Try email instead, or try again shortly.",
      emailFallback: true,
    });
  }

  return res.status(200).json({ ok: true, channel: "sms" });
}
