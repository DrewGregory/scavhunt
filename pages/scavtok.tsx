import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import { useCallback, useEffect, useRef, useState } from "react";
import { requireUserSSP } from "../lib/auth";
import { requireHuntStartedSSP } from "../lib/time";
import { getFeedPage } from "../lib/feedQuery";
import { useFeed } from "../lib/feedClient";
import type { FeedFilters } from "../lib/feedTypes";
import { useNearEndTrigger, usePreloadQueue } from "../lib/preloadQueue";
import { reportWebVitals } from "../lib/webVitals";
import ScavTokVideoCard from "../components/ScavTokVideoCard";
import BottomNavbar from "./components/BottomNavbar";
import TopNavbar from "./components/TopNavbar";

const PAGE_SIZE = 10;
const LOAD_MORE_FROM_END = 3;
const UNMUTE_KEY = "scavtok.unmuted";
const FILTERS: FeedFilters = { videoOnly: true };

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const huntRedirect = await requireHuntStartedSSP(auth.user.isAdmin);
  if (huntRedirect) return { redirect: huntRedirect };

  const initialPage = await getFeedPage({
    userId: auth.user.id,
    filters: FILTERS,
    limit: PAGE_SIZE,
  });

  return { props: { initialPage } };
};

export default function Page({
  initialPage,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);

  const queue = usePreloadQueue("reel", {
    rootRef: containerRef,
    onCurrentChange: setCurrentId,
  });
  const feed = useFeed(FILTERS, { limit: PAGE_SIZE, fallback: initialPage });
  const { updateItems } = feed;

  useEffect(() => {
    reportWebVitals("/scavtok");
    try {
      if (sessionStorage.getItem(UNMUTE_KEY) === "1") setMuted(false);
    } catch {
      // storage unavailable
    }
  }, []);

  const setMutedPref = useCallback((next: boolean) => {
    setMuted(next);
    try {
      sessionStorage.setItem(UNMUTE_KEY, next ? "0" : "1");
    } catch {
      // storage unavailable
    }
  }, []);

  const toggleFavorite = useCallback(
    async (submissionId: string) => {
      try {
        const response = await fetch("/api/toggle-favorite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        void updateItems((i) =>
          i.id !== submissionId || i.favorited === data.favorited
            ? i
            : {
                ...i,
                favorited: data.favorited,
                favoriteCount: i.favoriteCount + (data.favorited ? 1 : -1),
              },
        );
      } catch (error) {
        console.error("Failed to toggle favorite", error);
      }
    },
    [updateItems],
  );

  useNearEndTrigger(
    queue,
    loadMoreRef,
    feed.loadMore,
    feed.hasMore && !feed.isLoadingMore && !feed.error,
  );

  const triggerIndex = Math.max(0, feed.items.length - LOAD_MORE_FROM_END);

  return (
    <div className="scavtok" suppressHydrationWarning>
      <div className="app">
        <div className="container" ref={containerRef}>
          <TopNavbar />
          {feed.items.map((item, index) => {
            const team = feed.teams[item.teamId];
            if (!team) return null;
            return (
              <div key={item.id} style={{ display: "contents" }}>
                {index === triggerIndex && (
                  <div ref={loadMoreRef} style={{ height: 0 }} />
                )}
                <ScavTokVideoCard
                  item={item}
                  team={team}
                  index={index}
                  queue={queue}
                  isCurrent={item.id === currentId}
                  muted={muted}
                  onToggleMute={() => setMutedPref(!muted)}
                  onAutoplayBlocked={() => setMuted(true)}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
            );
          })}
          <BottomNavbar />
        </div>
      </div>
    </div>
  );
}
