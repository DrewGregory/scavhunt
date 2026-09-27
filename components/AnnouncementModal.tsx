"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./useSession";
import {
  AnnouncementGotItButton,
  AnnouncementPlayerShell,
} from "./AnnouncementPlayerShell";

type PendingAnnouncement = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
};

/**
 * Blocking announcement queue for logged-in players.
 * Shows one at a time; dismissing records server-side and advances to the next.
 */
export function AnnouncementModal() {
  const session = useSession();
  const [queue, setQueue] = useState<PendingAnnouncement[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setQueue([]);
      setLoaded(true);
      return;
    }
    try {
      const res = await fetch("/api/announcements/pending");
      if (!res.ok) return;
      const data = await res.json();
      setQueue((data.announcements ?? []) as PendingAnnouncement[]);
    } catch {
      /* don't block the app on fetch failure */
    } finally {
      setLoaded(true);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = queue[0] ?? null;
  const remaining = Math.max(0, queue.length - 1);

  const dismiss = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/announcements/${current.id}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) return;
      setQueue((prev) => prev.filter((a) => a.id !== current.id));
    } finally {
      setBusy(false);
    }
  };

  if (!session?.user || !loaded || !current) return null;

  return (
    <AnnouncementPlayerShell
      isOpen
      title={current.title}
      body={current.body}
      eyebrow={
        remaining > 0
          ? `Announcement · ${remaining} more after this`
          : "Announcement"
      }
      footer={
        <AnnouncementGotItButton
          onClick={() => void dismiss()}
          isLoading={busy}
        />
      }
    />
  );
}
