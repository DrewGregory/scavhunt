import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { PublicUser } from "../lib/auth";

export type SessionData = {
  user: PublicUser;
  team: PublicUser["team"];
};

/** Post an optional GPS fix to /api/team (server throttles Location rows to 15 min). */
async function postTeamLocation(location?: { lat: number; lng: number }) {
  const res = await fetch(`/api/team`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(location ? { location } : {}),
  });
  return res;
}

export const useSession = (): SessionData | null => {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);

  useEffect(() => {
    let watchId: number | null = null;
    let cancelled = false;

    (async () => {
      const res = await postTeamLocation();
      if (!res.ok) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (data.user == null) {
        router.push("/login");
        return;
      }
      if (cancelled) return;
      setSession({ user: data.user, team: data.team ?? data.user.team });

      const disableTracking =
        process.env.NEXT_PUBLIC_DISABLE_LOCATION_TRACKING === "true" ||
        process.env.NEXT_PUBLIC_DISABLE_LOCATION_TRACKING === "1";

      if (
        !disableTracking &&
        data.user.teamId &&
        typeof navigator !== "undefined" &&
        navigator.geolocation
      ) {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            void postTeamLocation({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
          },
          () => {
            /* permission denied / unavailable — ignore */
          },
          {
            enableHighAccuracy: false,
            maximumAge: 60_000,
            timeout: 15_000,
          },
        );
      }
    })();

    return () => {
      cancelled = true;
      if (watchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [router]);

  return session;
};

export type GeoFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

export type GetPositionOptions = {
  /** Prefer a fresh reading when possible. Default true for deposits. */
  enableHighAccuracy?: boolean;
  /** Accept a cached fix up to this age (ms). Default 30s. */
  maximumAge?: number;
  /** Browser geolocation timeout (ms). Default 12s. */
  timeout?: number;
  /**
   * Hard cap — some browsers never fire error/success. If exceeded, reject
   * (or resolve with `fallback` when provided by the caller via race).
   */
  hardTimeoutMs?: number;
};

/**
 * One-shot GPS fix that always settles. Uses a hard timeout because some
 * browsers ignore `timeout` / hang on `maximumAge: 0` + high accuracy.
 */
export function getPosition(
  options: GetPositionOptions = {},
): Promise<GeoFix> {
  const {
    enableHighAccuracy = true,
    maximumAge = 30_000,
    timeout = 12_000,
    hardTimeoutMs = 15_000,
  } = options;

  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available on this device"));
      return;
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      fn();
    };

    const hardTimer = setTimeout(() => {
      finish(() =>
        reject(new Error("Location request timed out — try again")),
      );
    }, Math.max(timeout + 1_000, hardTimeoutMs));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        finish(() =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy:
              typeof pos.coords.accuracy === "number"
                ? pos.coords.accuracy
                : null,
          }),
        );
      },
      (err) => {
        finish(() =>
          reject(new Error(err.message || "Could not get GPS fix")),
        );
      },
      { enableHighAccuracy, maximumAge, timeout },
    );
  });
}

/** @deprecated Prefer getPosition — kept for callers that want a fresh-ish fix. */
export function getHighAccuracyPosition(): Promise<GeoFix> {
  return getPosition({
    enableHighAccuracy: true,
    maximumAge: 15_000,
    timeout: 10_000,
    hardTimeoutMs: 12_000,
  });
}
