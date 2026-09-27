"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Flex, IconButton, Text } from "@chakra-ui/react";
import { LuArrowLeft } from "react-icons/lu";
import { useFeed } from "../lib/feedClient";
import {
  isFeedSubmission,
  type FeedFilters,
  type FeedPage,
} from "../lib/feedTypes";
import { useNearEndTrigger, usePreloadQueue } from "../lib/preloadQueue";
import ScavTokVideoCard from "./ScavTokVideoCard";
import BottomNavbar from "../pages/components/BottomNavbar";
import TopNavbar from "../pages/components/TopNavbar";

const PAGE_SIZE = 10;
const LOAD_MORE_FROM_END = 3;
const UNMUTE_KEY = "scavtok.unmuted";

export type ScavTokTab = "following" | "foryou";

export default function ScavTokReel({
  initialPage,
  onBackToList,
  userTeamId,
  defaultTab = "following",
}: {
  initialPage: FeedPage;
  onBackToList: () => void;
  /** Current user's team — required for For You. */
  userTeamId?: string | null;
  /** My Team opens For You; Feed opens Following. */
  defaultTab?: ScavTokTab;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [tab, setTab] = useState<ScavTokTab>(() =>
    defaultTab === "foryou" && userTeamId ? "foryou" : "following",
  );

  const filterTeamId = tab === "foryou" ? userTeamId ?? undefined : undefined;

  const filters: FeedFilters = useMemo(
    () => ({
      videoOnly: true,
      ...(filterTeamId ? { teamId: filterTeamId } : {}),
    }),
    [filterTeamId],
  );

  // Reuse SSR page only when it matches the active tab's filter.
  const fallback =
    (tab === "foryou" && defaultTab === "foryou") ||
    (tab === "following" && defaultTab === "following")
      ? initialPage
      : undefined;

  const queue = usePreloadQueue("reel", {
    rootRef: containerRef,
    onCurrentChange: setCurrentId,
  });
  const feed = useFeed(filters, { limit: PAGE_SIZE, fallback });
  const { updateItems } = feed;

  useEffect(() => {
    try {
      if (sessionStorage.getItem(UNMUTE_KEY) === "1") setMuted(false);
    } catch {
      /* ignore */
    }
  }, []);

  const setMutedPref = useCallback((next: boolean) => {
    setMuted(next);
    try {
      sessionStorage.setItem(UNMUTE_KEY, next ? "0" : "1");
    } catch {
      /* ignore */
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
        void updateItems((i) => {
          if (!isFeedSubmission(i) || i.id !== submissionId) return i;
          if (i.favorited === data.favorited) return i;
          return {
            ...i,
            favorited: data.favorited,
            favoriteCount: i.favoriteCount + (data.favorited ? 1 : -1),
          };
        });
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

  const videoItems = useMemo(
    () => feed.items.filter(isFeedSubmission),
    [feed.items],
  );
  const triggerIndex = Math.max(0, videoItems.length - LOAD_MORE_FROM_END);

  return (
    <Box
      className="scavtok"
      position="relative"
      h="100%"
      w="100%"
      overflow="hidden"
      suppressHydrationWarning
    >
      <IconButton
        aria-label="Back to feed"
        icon={<LuArrowLeft />}
        size="md"
        position="absolute"
        top={3}
        left={3}
        zIndex={30}
        bg="blackAlpha.600"
        color="white"
        _hover={{ bg: "blackAlpha.700" }}
        onClick={onBackToList}
      />
      <div className="app">
        <div className="container" ref={containerRef}>
          <TopNavbar
            tab={tab}
            onTabChange={setTab}
            forYouDisabled={!userTeamId}
          />
          {videoItems.length === 0 && !feed.isLoading && (
            <Flex h="100%" align="center" justify="center" px={6}>
              <Text color="whiteAlpha.800" textAlign="center">
                {tab === "foryou"
                  ? "No videos from your team yet."
                  : "No videos yet."}
              </Text>
            </Flex>
          )}
          {videoItems.map((item, index) => {
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
    </Box>
  );
}
