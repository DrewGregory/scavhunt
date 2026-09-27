import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";
import type { Team, User } from "@prisma/client";
import { serialize } from "cookie";
import { prisma } from "./prisma";
import {
  COOKIE_NAME,
  createSessionToken,
  decodeSession,
  sessionCookieOptions,
} from "./session";
import { requireHuntStartedApi, requireHuntStartedSSP } from "./time";

export type UserWithTeam = User & { team: Team | null };

export function adminEmailsFromEnv(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function assertSameOrigin(req: NextApiRequest): void {
  const origin = req.headers.origin;
  const expected = process.env.APP_ORIGIN;
  if (!origin || !expected) return;
  if (origin !== expected) {
    throw new Error("Invalid origin");
  }
}

function cookieFromReq(
  req: NextApiRequest | GetServerSidePropsContext["req"],
): string | undefined {
  return req.cookies?.[COOKIE_NAME];
}

export async function getUserFromReq(
  req: NextApiRequest | GetServerSidePropsContext["req"],
): Promise<UserWithTeam | null> {
  const token = cookieFromReq(req);
  const session = decodeSession(token);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { team: true },
  });
  // Soft-deleted only — inactive browsers may still hold a session (home lock).
  if (!user || user.deletedAt) return null;

  void prisma.user
    .update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => undefined);

  return user;
}

/** Admins and active users may enter feed/challenges/etc. Inactive = pending browse approval. */
export function canAccessHuntApp(user: {
  isAdmin: boolean;
  isActive: boolean;
}): boolean {
  return user.isAdmin || user.isActive;
}

/**
 * Redirect home if inactive (non-admin) or if the hunt has not started.
 * Call after requireUserSSP.
 */
export async function requireHuntAccessSSP(user: {
  isAdmin: boolean;
  isActive: boolean;
}): Promise<{ destination: string; permanent: false } | null> {
  if (!canAccessHuntApp(user)) {
    return { destination: "/", permanent: false };
  }
  return requireHuntStartedSSP(user.isAdmin);
}

/**
 * 403 if inactive (non-admin) or hunt not started.
 * Returns true if the request should proceed.
 */
export async function requireHuntAccessApi(
  res: NextApiResponse,
  user: { isAdmin: boolean; isActive: boolean },
): Promise<boolean> {
  if (!canAccessHuntApp(user)) {
    res.status(403).json({ error: "Account not approved yet" });
    return false;
  }
  return requireHuntStartedApi(res, user.isAdmin);
}

export type RequireUserResult =
  | { user: UserWithTeam; redirect?: undefined }
  | {
      user?: undefined;
      redirect: { destination: string; permanent: false };
    };

export async function requireUserSSP(
  ctx: GetServerSidePropsContext,
): Promise<RequireUserResult> {
  const user = await getUserFromReq(ctx.req);
  if (!user) {
    return { redirect: { destination: "/login", permanent: false } };
  }
  return { user };
}

export async function requireAdminSSP(
  ctx: GetServerSidePropsContext,
): Promise<RequireUserResult> {
  const result = await requireUserSSP(ctx);
  if (result.redirect) return result;
  if (!result.user?.isAdmin) {
    return { redirect: { destination: "/", permanent: false } };
  }
  return result;
}

export async function requireApiUser(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<UserWithTeam | null> {
  const user = await getUserFromReq(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return user;
}

export async function requireApiAdmin(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<UserWithTeam | null> {
  const user = await requireApiUser(req, res);
  if (!user) return null;
  if (!user.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return user;
}

export function setSessionCookie(res: NextApiResponse, token: string) {
  const opts = sessionCookieOptions();
  res.setHeader(
    "Set-Cookie",
    serialize(COOKIE_NAME, token, {
      httpOnly: opts.httpOnly,
      secure: opts.secure,
      sameSite: opts.sameSite,
      path: opts.path,
      maxAge: opts.maxAge,
    }),
  );
}

export function clearSessionCookie(res: NextApiResponse) {
  res.setHeader(
    "Set-Cookie",
    serialize(COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    }),
  );
}

export function publicUser(user: UserWithTeam) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    teamId: user.teamId,
    team: user.team
      ? {
          id: user.team.id,
          name: user.team.name,
          emoji: user.team.emoji,
          color: user.team.color,
        }
      : null,
    intent: user.intent,
    surveyCompletedAt: user.surveyCompletedAt
      ? user.surveyCompletedAt.toISOString()
      : null,
  };
}

export type PublicUser = ReturnType<typeof publicUser>;

export { createSessionToken };
