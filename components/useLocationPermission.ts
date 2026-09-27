import { useCallback, useEffect, useState } from "react";

export type LocationPermissionState =
  | "unknown"
  | "granted"
  | "prompt"
  | "denied"
  | "unsupported";

export type BrowserKind = "ios" | "safari" | "firefox" | "chromium" | "other";

export function detectBrowserKind(): BrowserKind {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Firefox\//.test(ua)) return "firefox";
  // Safari desktop (exclude Chrome/Chromium/Android)
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) {
    return "safari";
  }
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return "chromium";
  return "other";
}

function readPermissionState(
  status: PermissionState,
): Exclude<LocationPermissionState, "unknown" | "unsupported"> {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "prompt";
}

/** Shared so every hook instance stays in sync (e.g. after request()). */
let sharedState: LocationPermissionState = "unknown";
const listeners = new Set<(s: LocationPermissionState) => void>();
let querying = false;
let statusRef: PermissionStatus | null = null;

function setSharedState(next: LocationPermissionState) {
  if (sharedState === next) return;
  sharedState = next;
  listeners.forEach((l) => l(next));
}

function onPermissionChange() {
  if (!statusRef) return;
  setSharedState(readPermissionState(statusRef.state));
}

async function ensurePermissionQuery() {
  if (typeof navigator === "undefined") return;
  if (!navigator.geolocation) {
    setSharedState("unsupported");
    return;
  }
  if (querying || statusRef) return;
  querying = true;
  try {
    if (navigator.permissions?.query) {
      statusRef = await navigator.permissions.query({ name: "geolocation" });
      setSharedState(readPermissionState(statusRef.state));
      statusRef.addEventListener("change", onPermissionChange);
      return;
    }
  } catch {
    /* Permissions API missing or geolocation name unsupported */
  } finally {
    querying = false;
  }
  if (sharedState === "unknown") setSharedState("prompt");
}

/**
 * Tracks geolocation permission without prompting on mount.
 * Call `request()` from a user gesture to show the browser prompt.
 * State is shared across all hook instances.
 */
export function useLocationPermission(): {
  state: LocationPermissionState;
  request: () => Promise<boolean>;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<LocationPermissionState>(sharedState);

  useEffect(() => {
    listeners.add(setState);
    setState(sharedState);
    void ensurePermissionQuery();
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setSharedState("unsupported");
      return;
    }
    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({
          name: "geolocation",
        });
        if (statusRef !== status) {
          statusRef?.removeEventListener("change", onPermissionChange);
          statusRef = status;
          status.addEventListener("change", onPermissionChange);
        }
        setSharedState(readPermissionState(status.state));
        return;
      }
    } catch {
      /* Permissions API unavailable */
    }
    if (sharedState === "unknown") setSharedState("prompt");
  }, []);

  const request = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setSharedState("unsupported");
      return false;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setSharedState("granted");
          resolve(true);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setSharedState("denied");
            resolve(false);
            return;
          }
          // Timeout / unavailable — permission may still be granted.
          void (async () => {
            try {
              if (navigator.permissions?.query) {
                const status = await navigator.permissions.query({
                  name: "geolocation",
                });
                const next = readPermissionState(status.state);
                setSharedState(next);
                resolve(next === "granted");
                return;
              }
            } catch {
              /* Permissions API unavailable */
            }
            if (sharedState !== "denied" && sharedState !== "unsupported") {
              setSharedState("prompt");
            }
            resolve(false);
          })();
        },
        {
          enableHighAccuracy: false,
          maximumAge: 60_000,
          timeout: 10_000,
        },
      );
    });
  }, []);

  return { state, request, refresh };
}
