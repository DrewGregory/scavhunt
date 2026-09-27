"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { FiArrowLeft, FiList } from "react-icons/fi";
import { useFeed } from "../lib/feedClient";
import type { FeedFilters, FeedPage } from "../lib/feedTypes";
import { useNearEndTrigger, usePreloadQueue } from "../lib/preloadQueue";
import ScavTokVideoCard from "./ScavTokVideoCard";
import BottomNavbar from "../pages/components/BottomNavbar";
import TopNavbar from "../pages/components/TopNavbar";

const PAGE_SIZE = 10;
const LOAD_MORE_FROM_END = 3;
const UNMUTE_KEY = "scavtok.unmuted";
const FILTERS: FeedFilters = { videoOnly: true };

export default function ScavTokReel({
  initialPage,
  onBackToList,
}: {
  initialPage: FeedPage;
  onBackToList: () => void;
}) {
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
    <Box
      className="scavtok"
      position="relative"
      h="100%"
      w="100%"
      overflow="hidden"
      suppressHydrationWarning
    >
      <Flex
        position="absolute"
        top={3}
        left={3}
        zIndex={30}
        gap={2}
        align="center"
      >
        <IconButton
          aria-label="Back to feed"
          icon={<FiArrowLeft />}
          size="md"
          bg="blackAlpha.600"
          color="white"
          _hover={{ bg: "blackAlpha.700" }}
          onClick={onBackToList}
        />
        <Button
          size="sm"
          leftIcon={<FiList />}
          bg="blackAlpha.600"
          color="white"
          _hover={{ bg: "blackAlpha.700" }}
          onClick={onBackToList}
        >
          Feed
        </Button>
      </Flex>
      <div className="app">
        <div className="container" ref={containerRef}>
          <TopNavbar />
          {feed.items.length === 0 && !feed.isLoading && (
            <Flex h="100%" align="center" justify="center" px={6}>
              <Text color="whiteAlpha.800" textAlign="center">
                No videos yet.
              </Text>
            </Flex>
          )}
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
    </Box>
  );
}
