import { getHuntSettings } from "./time";

/** Env kill-switch (also baked into the client as NEXT_PUBLIC_*). */
export function isLocationTrackingEnvDisabled(): boolean {
  const v = process.env.NEXT_PUBLIC_DISABLE_LOCATION_TRACKING;
  return v === "true" || v === "1";
}

/**
 * Whether team GPS pings should be accepted / shown on the live map.
 * Off when the env kill-switch is set, or after the hunt window ends.
 */
export async function isLocationTrackingEnabled(): Promise<boolean> {
  if (isLocationTrackingEnvDisabled()) return false;
  const { endsAt } = await getHuntSettings();
  return Date.now() <= endsAt.getTime();
}
