/** Client-safe hunt access helpers (no Node crypto / session imports). */

/** Admins and active users may enter feed/challenges/etc. Inactive = manually held / legacy pending. */
export function canAccessHuntApp(user: {
  isAdmin: boolean;
  isActive: boolean;
}): boolean {
  return user.isAdmin || user.isActive;
}
