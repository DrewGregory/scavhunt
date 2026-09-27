import NavContainer from "../components/NavContainer";
import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import {
  Button,
  Card,
  Flex,
  Heading,
  HStack,
  Input,
  Link,
  Switch,
  Tag,
  Text,
  VStack,
  Image,
  Box,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
  Spinner,
  chakra,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { HiDotsVertical } from "react-icons/hi";
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai";
import { FaPlay } from "react-icons/fa";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDistance } from "date-fns";
import { useRouter } from "next/router";
import { publicUser, requireUserSSP } from "../lib/auth";
import { requireHuntStartedSSP } from "../lib/time";
import { getFeedPage } from "../lib/feedQuery";
import { useFeed } from "../lib/feedClient";
import {
  isImageUrl,
  isVideoUrl,
  type FeedChallenge,
  type FeedFilters,
  type FeedItem,
  type FeedPage,
} from "../lib/feedTypes";
import type { SerializedTeam } from "../lib/types";
import {
  listPublishedAnnouncements,
  serializeAnnouncement,
} from "../lib/announcements";
import {
  useNearEndTrigger,
  usePreloadQueue,
  useRegisterMedia,
  type PreloadQueue,
} from "../lib/preloadQueue";
import { usePlaybackTelemetry } from "../lib/playbackTelemetry";
import { reportWebVitals } from "../lib/webVitals";
import {
  FeedWithAnnouncements,
  type FeedAnnouncement,
} from "../components/FeedAnnouncements";
import ScavTokReel from "../components/ScavTokReel";
import { FiList } from "react-icons/fi";
import { FaVideo } from "react-icons/fa";

type ViewMode = "list" | "tok";
const TOK_PAGE_SIZE = 10;

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const huntRedirect = await requireHuntStartedSSP(auth.user.isAdmin);
  if (huntRedirect) return { redirect: huntRedirect };

  const user = auth.user!;
  const submissionParam =
    typeof context.query.submission === "string"
      ? context.query.submission
      : null;

  const [initialPage, tokInitialPage, pinnedPage, announcementRows] =
    await Promise.all([
      getFeedPage({ userId: user.id }),
      getFeedPage({
        userId: user.id,
        filters: { videoOnly: true },
        limit: TOK_PAGE_SIZE,
      }),
      submissionParam
        ? getFeedPage({ userId: user.id, ids: [submissionParam], limit: 1 })
        : Promise.resolve(null),
      listPublishedAnnouncements(),
    ]);

  return {
    props: {
      user: publicUser(user),
      initialPage,
      tokInitialPage,
      pinnedPage: pinnedPage && pinnedPage.items.length > 0 ? pinnedPage : null,
      announcements: announcementRows.map((row) => {
        const s = serializeAnnouncement(row);
        return {
          id: s.id,
          title: s.title,
          body: s.body,
          publishedAt: s.publishedAt,
          pinned: s.pinned,
        } satisfies FeedAnnouncement;
      }),
    },
  };
};

type AdminAction = "approve" | "reject" | "reset" | "delete";

const LOAD_MORE_FROM_END = 5;

function formatDuration(sec: number | null): string | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function FeedPage({
  user,
  initialPage,
  tokInitialPage,
  pinnedPage,
  announcements,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionSearchParam = searchParams.get("submission");
  const viewParam = router.query.view;
  const view: ViewMode =
    viewParam === "tok" || viewParam === "list" ? viewParam : "list";
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(
    submissionSearchParam,
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [sortByFavorites, setSortByFavorites] = useState<boolean>(false);
  const [showOnlyMyFavorites, setShowOnlyMyFavorites] =
    useState<boolean>(false);
  const [pinned, setPinned] = useState<FeedPage | null>(pinnedPage);

  const isAdmin = user.isAdmin;
  const selectedRef = useRef(selectedSubmission);
  const routerRef = useRef(router);
  routerRef.current = router;
  const ref = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const queue = usePreloadQueue("feed");

  const setQuery = useCallback(
    (patch: { view?: ViewMode; submission?: string | null }) => {
      const nextView = patch.view ?? view;
      const nextSubmission =
        patch.submission === undefined
          ? selectedRef.current
          : patch.submission;
      const query: Record<string, string> = { view: nextView };
      if (nextSubmission) query.submission = nextSubmission;
      void router.push({ pathname: "/feed", query }, undefined, {
        shallow: true,
      });
    },
    [router, view],
  );

  useEffect(() => {
    reportWebVitals("/feed");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const filters: FeedFilters = useMemo(
    () => ({
      q: debouncedQuery || undefined,
      favoritedOnly: showOnlyMyFavorites || undefined,
    }),
    [debouncedQuery, showOnlyMyFavorites],
  );
  const isDefaultFilters = !filters.q && !filters.favoritedOnly;

  const feed = useFeed(filters, {
    fallback: isDefaultFilters ? initialPage : undefined,
  });
  const { updateItems } = feed;

  const teams = useMemo(
    () => ({ ...pinned?.teams, ...feed.teams }),
    [pinned, feed.teams],
  );
  const challenges = useMemo(
    () => ({ ...pinned?.challenges, ...feed.challenges }),
    [pinned, feed.challenges],
  );

  const visibleItems = useMemo(() => {
    const pinnedItem = pinned?.items[0];
    const base =
      pinnedItem && isDefaultFilters && !feed.items.some((i) => i.id === pinnedItem.id)
        ? [pinnedItem, ...feed.items]
        : feed.items;
    return sortByFavorites
      ? [...base].sort((a, b) => b.favoriteCount - a.favoriteCount)
      : base;
  }, [pinned, feed.items, isDefaultFilters, sortByFavorites]);

  const patchItem = useCallback(
    (
      id: string,
      fn: (item: FeedItem) => FeedItem | null,
      revalidate = false,
    ) => {
      void updateItems((i) => (i.id === id ? fn(i) : i), { revalidate });
      setPinned((p) => {
        if (!p || p.items[0]?.id !== id) return p;
        const next = fn(p.items[0]);
        return next ? { ...p, items: [next] } : null;
      });
    },
    [updateItems],
  );

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
        patchItem(submissionId, (i) =>
          i.favorited === data.favorited
            ? i
            : showOnlyMyFavorites && !data.favorited
              ? null
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
    [patchItem, showOnlyMyFavorites],
  );

  const runAdminAction = useCallback(
    async (submissionId: string, action: AdminAction) => {
      if (action === "delete") {
        if (
          !confirm(
            "Are you sure you want to delete this submission? This action cannot be undone.",
          )
        ) {
          return;
        }
        try {
          const response = await fetch("/api/delete-submission", {
            method: "POST",
            body: JSON.stringify({ submissionId }),
          });
          if (response.ok) {
            patchItem(submissionId, () => null);
            if (selectedRef.current === submissionId) {
              selectedRef.current = null;
              setSelectedSubmission(null);
            }
          } else {
            const data = await response.json();
            alert(data.error || "Failed to delete submission");
          }
        } catch {
          alert("Failed to delete submission");
        }
        return;
      }

      const update =
        action === "approve"
          ? { accepted: true, rejected: false }
          : action === "reject"
            ? { accepted: false, rejected: true }
            : { accepted: false, rejected: false };
      const response = await fetch("/api/approve-submission", {
        method: "POST",
        body: JSON.stringify({ submissionId, ...update }),
      }).catch(() => null);
      if (!response?.ok) {
        alert("Failed to update submission");
        return;
      }
      // Revalidate so submission numbers and challenge counts catch up.
      patchItem(submissionId, (i) => ({ ...i, ...update }), true);
    },
    [patchItem],
  );

  const toggleOpen = useCallback(
    (id: string) => {
      const opening = id !== selectedRef.current;
      selectedRef.current = opening ? id : null;
      setSelectedSubmission(selectedRef.current);
      queue.setFocus(selectedRef.current);
      setQuery({
        view: "list",
        submission: selectedRef.current,
      });
      return opening;
    },
    [queue, setQuery],
  );

  const editSubmission = useCallback((id: string) => {
    void routerRef.current.push(`/update-submission/${id}`);
  }, []);

  useEffect(() => {
    queue.setFocus(selectedSubmission);
  }, [queue, selectedSubmission]);

  useEffect(() => {
    ref.current?.scrollIntoView();
  }, []);

  useNearEndTrigger(
    queue,
    loadMoreRef,
    feed.loadMore,
    feed.hasMore && !feed.isLoadingMore && !feed.error,
  );

  const triggerIndex = Math.max(0, visibleItems.length - LOAD_MORE_FROM_END);
  const noSubmissionsAtAll =
    isDefaultFilters && !feed.isLoading && visibleItems.length === 0;

  const viewToggle = (
    <HStack
      bg="white"
      borderRadius="md"
      boxShadow="sm"
      borderWidth="1px"
      p={1}
      spacing={0}
    >
      <Button
        size="sm"
        leftIcon={<FiList />}
        variant={view === "list" ? "solid" : "ghost"}
        colorScheme={view === "list" ? "blue" : "gray"}
        onClick={() => setQuery({ view: "list" })}
      >
        Feed
      </Button>
      <Button
        size="sm"
        leftIcon={<FaVideo />}
        variant={view === "tok" ? "solid" : "ghost"}
        colorScheme={view === "tok" ? "blue" : "gray"}
        onClick={() => setQuery({ view: "tok", submission: null })}
      >
        ScavTok
      </Button>
    </HStack>
  );

  if (view === "tok") {
    return (
      <NavContainer title="ScavTok" fullScreen hideTopBar bgColor="black">
        <Box position="relative" flex={1} w="100%" h="100%" minH={0}>
          <Box
            position="absolute"
            top={4}
            right={4}
            zIndex={40}
            display={{ base: "none", md: "block" }}
          >
            {viewToggle}
          </Box>
          <ScavTokReel
            initialPage={tokInitialPage}
            onBackToList={() => setQuery({ view: "list", submission: null })}
          />
        </Box>
      </NavContainer>
    );
  }

  return (
    <NavContainer title="Feed">
      <FeedWithAnnouncements announcements={announcements}>
      {noSubmissionsAtAll ? (
        <VStack spacing={4} mt={8}>
          <Flex w="100%" justify="flex-end">
            {viewToggle}
          </Flex>
          <Heading size="lg" color="gray.500" textAlign="center">
            No Submissions Yet!
          </Heading>
        </VStack>
      ) : (
        <VStack justifyContent="flex-start" width="100%" spacing={4}>
          <Flex w="100%" gap={3} align="center">
            <Input
              placeholder="Search by team name or challenge name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              flex={1}
              bg="white"
              borderRadius="md"
              boxShadow="sm"
              size="md"
            />
            {viewToggle}
          </Flex>
          <VStack width="100%" spacing={2}>
            {isAdmin && (
              <HStack
                width="100%"
                bg="white"
                p={3}
                borderRadius="md"
                boxShadow="sm"
                justifyContent="space-between"
              >
                <Text fontSize="sm" fontWeight="medium" color="gray.700">
                  Sort by favorites{" "}
                  <Text as="span" fontSize="xs" color="gray.500">
                    [Visible to Admins Only · loaded items]
                  </Text>
                </Text>
                <Switch
                  isChecked={sortByFavorites}
                  onChange={(e) => setSortByFavorites(e.target.checked)}
                  colorScheme="red"
                />
              </HStack>
            )}
            <HStack
              width="100%"
              bg="white"
              p={3}
              borderRadius="md"
              boxShadow="sm"
              justifyContent="space-between"
            >
              <Text fontSize="sm" fontWeight="medium" color="gray.700">
                Show only my favorites
              </Text>
              <Switch
                isChecked={showOnlyMyFavorites}
                onChange={(e) => setShowOnlyMyFavorites(e.target.checked)}
                colorScheme="red"
              />
            </HStack>
          </VStack>
          {!feed.isLoading && visibleItems.length === 0 ? (
            <Heading size="md" color="gray.500" textAlign="center" mt={8}>
              No submissions match your search.
            </Heading>
          ) : null}
          {feed.isLoading && visibleItems.length === 0 ? (
            <Spinner color="gray.400" mt={8} />
          ) : null}
          {visibleItems.map((s, index) => {
            const challenge = challenges[s.challengeId];
            const team = teams[s.teamId];
            if (!challenge || !team) return null;
            return (
              <Box key={s.id} width="100%">
                {index === triggerIndex && <Box ref={loadMoreRef} h={0} />}
                <FeedCard
                  item={s}
                  index={index}
                  team={team}
                  challenge={challenge}
                  queue={queue}
                  cardRef={s.id === submissionSearchParam ? ref : undefined}
                  isOpen={s.id === selectedSubmission}
                  isAdmin={isAdmin}
                  canManage={isAdmin || user.teamId === s.teamId}
                  showFavoriteCount={isAdmin && sortByFavorites}
                  onToggleOpen={toggleOpen}
                  onToggleFavorite={toggleFavorite}
                  onAdminAction={runAdminAction}
                  onEdit={editSubmission}
                />
              </Box>
            );
          })}
          {feed.isLoadingMore && <Spinner color="gray.400" my={4} />}
          {feed.error && (
            <Button size="sm" variant="outline" onClick={() => feed.mutate()}>
              Couldn&apos;t load more — retry
            </Button>
          )}
        </VStack>
      )}
      </FeedWithAnnouncements>
    </NavContainer>
  );
}

type FeedCardProps = {
  item: FeedItem;
  index: number;
  team: SerializedTeam;
  challenge: FeedChallenge;
  queue: PreloadQueue;
  cardRef?: React.Ref<HTMLDivElement>;
  isOpen: boolean;
  isAdmin: boolean;
  canManage: boolean;
  showFavoriteCount: boolean;
  onToggleOpen: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
  onAdminAction: (id: string, action: AdminAction) => void;
  onEdit: (id: string) => void;
};

const FeedCard = memo(function FeedCard({
  item: s,
  index,
  team,
  challenge,
  queue,
  cardRef,
  isOpen,
  isAdmin,
  canManage,
  showFavoriteCount,
  onToggleOpen,
  onToggleFavorite,
  onAdminAction,
  onEdit,
}: FeedCardProps) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = isVideoUrl(s.mediaURL);
  const isImage = !isVideo && isImageUrl(s.mediaURL);

  const { posterReady } = useRegisterMedia(queue, mediaRef, videoRef, {
    id: s.id,
    index,
    posterUrl: isVideo ? s.posterURL : isImage ? s.mediaURL : null,
    videoUrl: isVideo ? s.mediaURL : null,
    hasPoster: !!s.posterURL,
    compressed: s.compressed,
    sizeBytes: s.sizeBytes,
  });

  const markPlayIntent = usePlaybackTelemetry(videoRef, {
    submissionId: s.id,
    challengeId: s.challengeId,
    source: "feed",
    compressed: s.compressed,
    sizeBytes: s.sizeBytes,
  });

  const handleToggle = () => {
    const opening = onToggleOpen(s.id);
    const v = videoRef.current;
    if (!v) return;
    if (opening) {
      markPlayIntent("tap");
      v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  };

  const duration = formatDuration(s.durationSec);
  const aspect =
    s.width && s.height ? `${s.width} / ${s.height}` : "16 / 9";

  return (
    <Card
      ref={cardRef}
      width="100%"
      className={isOpen ? "card open" : "card"}
      boxShadow="sm"
      _hover={{ boxShadow: "md" }}
      transition="all 0.2s"
      borderRadius="lg"
    >
      <Flex
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        p={4}
        gap={3}
      >
        <Flex
          flex={1}
          direction="column"
          gap={2}
          cursor="pointer"
          onClick={handleToggle}
        >
          <Flex alignItems="center" gap={2} flexWrap="wrap">
            <Text fontSize="lg" fontWeight="semibold" color="gray.800">
              {challenge.emoji
                ? `${challenge.emoji} ${challenge.title}`
                : challenge.title}
            </Text>
            <Tag
              size="sm"
              colorScheme={s.accepted ? "green" : s.rejected ? "red" : "orange"}
              fontWeight="medium"
            >
              {s.accepted ? "Accepted" : s.rejected ? "Rejected" : "Pending"}
            </Tag>
          </Flex>
          <Text fontSize="sm" color="gray.600" suppressHydrationWarning>
            {formatDistance(new Date(s.createdAt), new Date())} ago by{" "}
            <Link
              href={`/teams?team=${s.teamId}`}
              fontWeight="medium"
              color="gray.700"
              _hover={{ color: "gray.900", textDecoration: "underline" }}
              onClick={(e) => e.stopPropagation()}
            >
              {team.emoji} {team.name}
            </Link>
          </Text>
          {!s.rejected && s.submissionNumber != null && (
            <Text fontSize="xs" color="gray.500" fontWeight="medium">
              {s.accepted ? (
                <>
                  Submission #{s.submissionNumber} of {challenge.numWinners}{" "}
                  spot{challenge.numWinners === 1 ? "" : "s"}
                </>
              ) : (
                <>
                  Submission #{s.submissionNumber} ({challenge.acceptedCount}{" "}
                  accepted, {challenge.pendingCount} pending /{" "}
                  {challenge.numWinners} spot
                  {challenge.numWinners === 1 ? "" : "s"})
                </>
              )}
            </Text>
          )}
        </Flex>

        <Flex alignItems="center" gap={1} flexShrink={0}>
          <Flex
            alignItems="center"
            justifyContent="center"
            bg="blue.50"
            borderRadius="md"
            px={3}
            py={1}
            minWidth="fit-content"
          >
            <Text fontSize="md" fontWeight="bold" color="blue.700">
              {challenge.pts} pts
            </Text>
          </Flex>
          <Flex alignItems="center" gap={0}>
            <IconButton
              aria-label="Toggle favorite"
              icon={s.favorited ? <AiFillHeart /> : <AiOutlineHeart />}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(s.id);
              }}
              variant="ghost"
              color={s.favorited ? "red.500" : "gray.400"}
              _hover={{
                color: s.favorited ? "red.600" : "gray.500",
                bg: "transparent",
              }}
              size="md"
              fontSize="xl"
            />
            {showFavoriteCount && (
              <Text
                fontSize="sm"
                fontWeight="semibold"
                color="gray.600"
                minW="15px"
              >
                {s.favoriteCount}
              </Text>
            )}
          </Flex>
          {canManage && (
            <Box visibility={isOpen ? "visible" : "hidden"} width="32px">
              <Menu>
                <MenuButton
                  as={IconButton}
                  icon={<HiDotsVertical />}
                  variant="ghost"
                  size="sm"
                  aria-label="Options"
                  onClick={(e) => e.stopPropagation()}
                  _hover={{ bg: "gray.100" }}
                />
                <MenuList>
                  {isAdmin && (
                    <>
                      {!s.accepted && (
                        <MenuItem
                          onClick={() => onAdminAction(s.id, "approve")}
                          color={s.rejected ? "green.600" : undefined}
                          fontWeight={s.rejected ? "semibold" : undefined}
                        >
                          {s.rejected
                            ? "✓ Approve Submission"
                            : "Approve Submission"}
                        </MenuItem>
                      )}
                      {!s.rejected && (
                        <MenuItem
                          onClick={() => onAdminAction(s.id, "reject")}
                          color={s.accepted ? "red.600" : undefined}
                          fontWeight={s.accepted ? "semibold" : undefined}
                        >
                          {s.accepted
                            ? "✗ Reject Submission"
                            : "Reject Submission"}
                        </MenuItem>
                      )}
                      {(s.accepted || s.rejected) && (
                        <MenuItem
                          onClick={() => onAdminAction(s.id, "reset")}
                          color="blue.600"
                        >
                          ↺ Reset to Pending
                        </MenuItem>
                      )}
                    </>
                  )}
                  <MenuItem onClick={() => onEdit(s.id)}>
                    {s.mediaURL ? "Update Video" : "Add Video"}
                  </MenuItem>
                  {isAdmin && (
                    <MenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdminAction(s.id, "delete");
                      }}
                      color="red.600"
                      _hover={{ bg: "red.50" }}
                    >
                      Delete Submission
                    </MenuItem>
                  )}
                </MenuList>
              </Menu>
            </Box>
          )}
          <ChevronDownIcon
            w={5}
            h={5}
            color="gray.500"
            className={isOpen ? "chevron rotate" : "chevron"}
          />
        </Flex>
      </Flex>

      {(isVideo || isImage) && (
        <Box px={4} pb={isOpen ? 2 : 4}>
          <Box
            ref={mediaRef}
            position="relative"
            width="100%"
            bg="gray.100"
            borderRadius="md"
            overflow="hidden"
            display="flex"
            justifyContent="center"
            cursor={isOpen ? undefined : "pointer"}
            onClick={isOpen ? undefined : handleToggle}
          >
            {isVideo && (
              <chakra.video
                ref={videoRef}
                controls={isOpen}
                playsInline
                poster={posterReady && s.posterURL ? s.posterURL : undefined}
                width="100%"
                maxWidth={isOpen ? "800px" : undefined}
                height={isOpen ? undefined : "200px"}
                maxHeight={isOpen ? "500px" : undefined}
                objectFit={isOpen ? "contain" : "cover"}
                sx={isOpen ? { aspectRatio: aspect } : undefined}
              />
            )}
            {isImage &&
              (posterReady ? (
                <Image
                  src={s.mediaURL!}
                  alt={s.note}
                  width="100%"
                  height={isOpen ? undefined : "200px"}
                  maxHeight={isOpen ? "500px" : undefined}
                  objectFit={isOpen ? "contain" : "cover"}
                />
              ) : (
                <Box height="200px" width="100%" />
              ))}
            {isVideo && !isOpen && (
              <Flex
                position="absolute"
                inset={0}
                alignItems="center"
                justifyContent="center"
                pointerEvents="none"
              >
                <Flex
                  bg="blackAlpha.600"
                  color="white"
                  borderRadius="full"
                  w="44px"
                  h="44px"
                  alignItems="center"
                  justifyContent="center"
                  pl="3px"
                >
                  <FaPlay />
                </Flex>
              </Flex>
            )}
            {isVideo && !isOpen && duration && (
              <Text
                position="absolute"
                bottom={2}
                right={2}
                bg="blackAlpha.700"
                color="white"
                fontSize="xs"
                fontWeight="semibold"
                px={2}
                py={0.5}
                borderRadius="md"
                pointerEvents="none"
              >
                {duration}
              </Text>
            )}
          </Box>
        </Box>
      )}

      {isOpen && (s.note || (s.mediaURL && !isVideo && !isImage)) && (
        <Flex
          direction="column"
          gap={4}
          px={4}
          pb={4}
          pt={2}
          borderTop="1px"
          borderColor="gray.100"
          className="expandable-content"
        >
          {s.mediaURL && !isVideo && !isImage && (
            <Link
              href={s.mediaURL}
              color="blue.600"
              fontWeight="medium"
              _hover={{ textDecoration: "underline" }}
            >
              View media
            </Link>
          )}
          {s.note && (
            <Box
              bg="gray.50"
              p={4}
              borderRadius="md"
              borderLeft="3px solid"
              borderColor="gray.300"
            >
              <Text color="gray.700" lineHeight="tall">
                {s.note}
              </Text>
            </Box>
          )}
        </Flex>
      )}
    </Card>
  );
});
