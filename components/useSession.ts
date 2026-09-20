import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { PublicUser } from "../lib/auth";

export type SessionData = {
  user: PublicUser;
  team: PublicUser["team"];
};

export const useSession = (): SessionData | null => {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (data.user == null) {
        router.push("/login");
        return;
      }
      setSession({ user: data.user, team: data.team ?? data.user.team });
    })();
  }, [router]);

  return session;
};
