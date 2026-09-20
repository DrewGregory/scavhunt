/**
 * Bird Verify client (SMS + email OTP).
 * Docs: https://docs.bird.com/api/verify-api
 */

function birdHost(): string {
  return (process.env.BIRD_API_HOST || "https://us1.platform.bird.com").replace(
    /\/$/,
    "",
  );
}

function birdKey(): string {
  const key = process.env.BIRD_API_KEY;
  if (!key) throw new Error("BIRD_API_KEY is not set");
  return key;
}

function envFlag(name: string): string {
  return String(process.env[name] ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();
}

/** Server-side mock check. Prefer `isBirdMockClient()` in browser code. */
export function mockMode(): boolean {
  const raw = envFlag("BIRD_MOCK");
  if (raw === "false" || raw === "0" || raw === "off") return false;
  if (raw === "true" || raw === "1" || raw === "on") return true;
  return process.env.NODE_ENV !== "production";
}

/** Client-safe mock flag (uses NEXT_PUBLIC_BIRD_MOCK). */
export function isBirdMockClient(): boolean {
  if (typeof window === "undefined") return mockMode();
  const raw = String(process.env.NEXT_PUBLIC_BIRD_MOCK ?? "")
    .trim()
    .toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  if (raw === "true" || raw === "1" || raw === "on") return true;
  return process.env.NODE_ENV !== "production";
}

export class BirdError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "BirdError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.ceil(asSeconds);
  }
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  }
  return undefined;
}

export function parseRateLimitReset(header: string | null): number | undefined {
  if (!header) return undefined;
  const remaining = header.match(/[;,\s]r=(\d+)/i);
  const reset = header.match(/[;,\s]t=(\d+)/i);
  if (!reset) return undefined;
  if (remaining && Number(remaining[1]) > 0) return undefined;
  return Number(reset[1]);
}

export function formatWait(seconds: number): string {
  if (seconds <= 1) return "1 second";
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export type OtpDestination =
  | { kind: "sms"; phoneE164: string }
  | { kind: "email"; email: string };

function birdTo(dest: OtpDestination) {
  return dest.kind === "email"
    ? { email: dest.email }
    : { phone_number: dest.phoneE164 };
}

function destLabel(dest: OtpDestination): string {
  return dest.kind === "email" ? dest.email : dest.phoneE164;
}

export async function birdSendOtp(
  dest: OtpDestination,
  idempotencyKey: string,
): Promise<void> {
  if (mockMode()) {
    console.info(`[bird-mock] OTP for ${destLabel(dest)} is 000000`);
    return;
  }

  const res = await fetch(`${birdHost()}/v1/verify/verifications`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${birdKey()}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      to: birdTo(dest),
      options: {
        channels: dest.kind === "email" ? ["email"] : ["sms"],
        code_length: 6,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const retryAfterSeconds =
      parseRetryAfter(res.headers.get("retry-after")) ??
      parseRateLimitReset(res.headers.get("ratelimit"));
    console.error("Bird send failed", res.status, {
      retryAfter: res.headers.get("retry-after"),
      rateLimit: res.headers.get("ratelimit"),
      body: text,
    });
    throw new BirdError(
      "Failed to send verification code",
      res.status,
      retryAfterSeconds,
    );
  }
}

export async function birdCheckOtp(
  dest: OtpDestination,
  code: string,
): Promise<{ success: boolean; reason?: string }> {
  if (mockMode()) {
    return { success: code.trim() === "000000", reason: "incorrect_code" };
  }

  const res = await fetch(`${birdHost()}/v1/verify/verifications/check`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${birdKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: birdTo(dest),
      code: code.trim(),
    }),
  });

  if (res.status === 404) {
    return { success: false, reason: "expired" };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Bird check failed", res.status, text);
    throw new Error("Failed to verify code");
  }

  const data = (await res.json()) as {
    success?: boolean;
    reason?: string;
  };
  return { success: Boolean(data.success), reason: data.reason };
}
