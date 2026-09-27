import NavContainer from "../components/NavContainer";
import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import {
  Button,
  Flex,
  HStack,
  Link,
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
import { HiDotsVertical } from "react-icons/hi";
import { LuHeart } from "react-icons/lu";
import { FaPlay } from "react-icons/fa";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useSearchParams } from "next/navigation";
import { formatDistance } from "date-fns";
import { useRouter } from "next/router";
import { publicUser, requireUserSSP, requireHuntAccessSSP } from "../lib/auth";
import { getFeedPage } from "../lib/feedQuery";
import { useFeed } from "../lib/feedClient";
import {
  isImageUrl,
  isVideoUrl,
  type FeedChallenge,
  type FeedFilters,
  type FeedPage,
  type FeedRow,
  type FeedStatus,
  type FeedSubmissionItem,
  isFeedDeposit,
  isFeedSubmission,
} from "../lib/feedTypes";
import type { SerializedTeam } from "../lib/types";
import {
  getPinnedAnnouncement,
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
import DataList from "../components/dataList/DataList";
import DataListToolbar from "../components/dataList/DataListToolbar";
import SubmissionComments from "../components/SubmissionComments";

type ViewMode = "list" | "tok";
const TOK_PAGE_SIZE = 10;

type FeedSortId = "newest" | "favorites";
type FeedFilterId =
  | "myFavorites"
  | "myTeam"
  | "videoOnly"
  | "statusPending"
  | "statusAccepted"
  | "statusRejected";

const STATUS_FILTERS: FeedFilterId[] = [
  "statusPending",
  "statusAccepted",
  "statusRejected",
];

function ordinal(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

/** Standing for list + expanded rows, e.g. "1st out of 5". */
function submissionStanding(
  number: number,
  numWinners: number,
): string {
  return `${ordinal(number)} out of ${numWinners}`;
}

const columnHelper = createColumnHelper<FeedRow>();


export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const huntRedirect = await requireHuntAccessSSP(auth.user);
  if (huntRedirect) return { redirect: huntRedirect };

  const user = auth.user!;
  const submissionParam =
    typeof context.query.submission === "string"
      ? context.query.submission
      : null;
  const teamIdParam =
    typeof context.query.teamId === "string" ? context.query.teamId : null;

  const feedOpts = {
    includeChallengePrompt: user.isAdmin,
  } as const;

  const [initialPage, tokInitialPage, pinnedPage, pinnedAnnouncementRow] =
    await Promise.all([
      getFeedPage({ userId: user.id, ...feedOpts }),
      getFeedPage({
        userId: user.id,
        ...feedOpts,
        filters: {
          videoOnly: true,
          ...(teamIdParam ? { teamId: teamIdParam } : {}),
        },
        limit: TOK_PAGE_SIZE,
      }),
      submissionParam
        ? getFeedPage({
            userId: user.id,
            ...feedOpts,
            ids: [submissionParam],
            limit: 1,
          })
        : Promise.resolve(null),
      getPinnedAnnouncement(),
    ]);

  const pinnedAnnouncement = pinnedAnnouncementRow
    ? (() => {
        const s = serializeAnnouncement(pinnedAnnouncementRow);
        return {
          id: s.id,
          title: s.title,
          body: s.body,
          publishedAt: s.publishedAt,
          pinned: s.pinned,
        } satisfies FeedAnnouncement;
      })()
    : null;

  return {
    props: {
      user: publicUser(user),
      initialPage,
      tokInitialPage,
      tokTeamId: teamIdParam,
      pinnedPage: pinnedPage && pinnedPage.items.length > 0 ? pinnedPage : null,
      pinnedAnnouncement,
    },
  };
};

type AdminAction = "approve" | "reject" | "reset" | "delete";

function formatDuration(sec: number | null): string | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function FeedPage({
  user,
  initialPage,
  tokInitialPage,
  tokTeamId,
  pinnedPage,
  pinnedAnnouncement,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionSearchParam = searchParams.get("submission");
  const viewParam = router.query.view;
  const view: ViewMode =
    viewParam === "tok" || viewParam === "list" ? viewParam : "list";
  const teamIdFromQuery =
    typeof router.query.teamId === "string"
      ? router.query.teamId
      : tokTeamId;
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(
    submissionSearchParam,
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [sortId, setSortId] = useState<FeedSortId>("newest");
  const [activeFilters, setActiveFilters] = useState<FeedFilterId[]>([]);
  const [pinned, setPinned] = useState<FeedPage | null>(pinnedPage);

  const isAdmin = user.isAdmin;
  const selectedRef = useRef(selectedSubmission);
  const routerRef = useRef(router);
  routerRef.current = router;
  const rowRef = useRef<HTMLTableRowElement>(null);
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

  const favoritedOnly = activeFilters.includes("myFavorites");
  const myTeamOnly = activeFilters.includes("myTeam");
  const videoOnly = activeFilters.includes("videoOnly");
  const statusFilter: FeedStatus | undefined = activeFilters.includes(
    "statusPending",
  )
    ? "pending"
    : activeFilters.includes("statusAccepted")
      ? "accepted"
      : activeFilters.includes("statusRejected")
        ? "rejected"
        : undefined;

  const filters: FeedFilters = useMemo(
    () => ({
      q: debouncedQuery || undefined,
      favoritedOnly: favoritedOnly || undefined,
      videoOnly: videoOnly || undefined,
      teamId: myTeamOnly && user.teamId ? user.teamId : undefined,
      status: statusFilter,
    }),
    [
      debouncedQuery,
      favoritedOnly,
      videoOnly,
      myTeamOnly,
      user.teamId,
      statusFilter,
    ],
  );
  const isDefaultFilters =
    !filters.q &&
    !filters.favoritedOnly &&
    !filters.videoOnly &&
    !filters.teamId &&
    !filters.status;

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
  const neighborhoods = useMemo(
    () => ({ ...pinned?.neighborhoods, ...feed.neighborhoods }),
    [pinned, feed.neighborhoods],
  );

  const visibleItems = useMemo(() => {
    const pinnedItem = pinned?.items[0];
    const base =
      pinnedItem &&
      isDefaultFilters &&
      !feed.items.some((i) => i.id === pinnedItem.id)
        ? [pinnedItem, ...feed.items]
        : feed.items;
    if (sortId !== "favorites") return base;
    return [...base].sort((a, b) => {
      if (isFeedSubmission(a) && isFeedSubmission(b)) {
        return b.favoriteCount - a.favoriteCount;
      }
      if (isFeedSubmission(a)) return -1;
      if (isFeedSubmission(b)) return 1;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [pinned, feed.items, isDefaultFilters, sortId]);

  const toggleFilter = useCallback((id: string) => {
    const fid = id as FeedFilterId;
    setActiveFilters((prev) => {
      if (STATUS_FILTERS.includes(fid)) {
        const withoutStatus = prev.filter((x) => !STATUS_FILTERS.includes(x));
        if (prev.includes(fid)) return withoutStatus;
        return [...withoutStatus, fid];
      }
      return prev.includes(fid)
        ? prev.filter((x) => x !== fid)
        : [...prev, fid];
    });
  }, []);

  const clearFilter = useCallback((id: string) => {
    setActiveFilters((prev) => prev.filter((x) => x !== id));
  }, []);

  const patchItem = useCallback(
    (
      id: string,
      fn: (item: FeedSubmissionItem) => FeedSubmissionItem | null,
      revalidate = false,
    ) => {
      void updateItems((i) => {
        if (i.id !== id || !isFeedSubmission(i)) return i;
        const next = fn(i);
        return next;
      }, { revalidate });
      setPinned((p) => {
        if (!p || p.items[0]?.id !== id || !isFeedSubmission(p.items[0])) {
          return p;
        }
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
            : favoritedOnly && !data.favorited
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
    [patchItem, favoritedOnly],
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
      const row = visibleItems.find((i) => i.id === id);
      if (row && isFeedDeposit(row)) return false;
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
    [queue, setQuery, visibleItems],
  );

  const editSubmission = useCallback((id: string) => {
    void routerRef.current.push(`/update-submission/${id}`);
  }, []);

  useEffect(() => {
    queue.setFocus(selectedSubmission);
  }, [queue, selectedSubmission]);

  useEffect(() => {
    if (!selectedSubmission) return;
    rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedSubmission]);

  useNearEndTrigger(
    queue,
    loadMoreRef,
    feed.loadMore,
    feed.hasMore && !feed.isLoadingMore && !feed.error,
  );

  const noFeedItemsAtAll =
    isDefaultFilters && !feed.isLoading && visibleItems.length === 0;

  const sortOptions = useMemo(
    () => [
      { id: "newest", label: "Newest" },
      ...(isAdmin
        ? [{ id: "favorites", label: "Most favorited" }]
        : []),
    ],
    [isAdmin],
  );

  const filterOptions = useMemo(() => {
    const opts: Array<{ id: FeedFilterId; label: string }> = [
      { id: "myFavorites", label: "My favorites" },
    ];
    if (user.teamId) {
      opts.push({ id: "myTeam", label: "My team" });
    }
    opts.push(
      { id: "videoOnly", label: "Videos only" },
      { id: "statusPending", label: "Pending" },
      { id: "statusAccepted", label: "Accepted" },
      { id: "statusRejected", label: "Rejected" },
    );
    return opts;
  }, [user.teamId]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "thumb",
        header: "",
        cell: ({ row }) => {
          const item = row.original;
          if (isFeedDeposit(item)) {
            const nbh = neighborhoods[item.neighborhoodId];
            return (
              <Flex
                w="48px"
                h="48px"
                borderRadius="md"
                bg="teal.50"
                flexShrink={0}
                align="center"
                justify="center"
                fontSize="xl"
              >
                {nbh?.emoji ?? "🗺️"}
              </Flex>
            );
          }
          const s = item;
          const isVideo = isVideoUrl(s.mediaURL);
          const isImage = !isVideo && isImageUrl(s.mediaURL);
          const src = isVideo
            ? s.posterURL
            : isImage
              ? s.mediaURL
              : null;
          return (
            <Box
              w="48px"
              h="48px"
              borderRadius="md"
              overflow="hidden"
              bg="gray.100"
              flexShrink={0}
              position="relative"
            >
              {src ? (
                <Image
                  src={src}
                  alt=""
                  w="100%"
                  h="100%"
                  objectFit="cover"
                />
              ) : null}
              {isVideo && (
                <Flex
                  position="absolute"
                  inset={0}
                  align="center"
                  justify="center"
                  bg="blackAlpha.400"
                >
                  <FaPlay color="white" size={10} />
                </Flex>
              )}
            </Box>
          );
        },
      }),
      columnHelper.display({
        id: "primary",
        header: "Activity",
        cell: ({ row }) => {
          const item = row.original;
          const team = teams[item.teamId];
          if (!team) return null;

          if (isFeedDeposit(item)) {
            const nbh = neighborhoods[item.neighborhoodId];
            const nbhName = nbh?.name ?? "a neighborhood";
            const controlSuffix = item.tookControl
              ? item.displacedTeam
                ? ` and took control from ${item.displacedTeam.emoji} ${item.displacedTeam.name}`
                : " and took control"
              : "";
            return (
              <Box minW={0}>
                <Text fontWeight="semibold" color="gray.800" lineHeight="short">
                  {team.emoji} {team.name} added {item.points} point
                  {item.points === 1 ? "" : "s"} to {nbhName}
                  {controlSuffix}
                </Text>
                <Text fontSize="sm" color="gray.500" mt={1.5}>
                  {formatDistance(new Date(item.createdAt), new Date())} ago
                </Text>
              </Box>
            );
          }

          const s = item;
          const challenge = challenges[s.challengeId];
          if (!challenge) return null;
          return (
            <Box minW={0}>
              <Flex align="center" gap={1} flexWrap="wrap" rowGap={0.5}>
                <Text fontWeight="semibold" color="gray.800" lineHeight="short">
                  {challenge.emoji
                    ? `${challenge.emoji} ${challenge.title}`
                    : challenge.title}
                </Text>
                <Tag
                  size="sm"
                  colorScheme={
                    s.accepted ? "green" : s.rejected ? "red" : "orange"
                  }
                >
                  {s.accepted
                    ? "Accepted"
                    : s.rejected
                      ? "Rejected"
                      : "Pending"}
                </Tag>
              </Flex>
              <Text fontSize="sm" color="gray.500" mt={1.5}>
                {team.emoji} {team.name} ·{" "}
                {formatDistance(new Date(s.createdAt), new Date())} ago
                {!s.rejected && s.submissionNumber != null
                  ? ` · ${submissionStanding(s.submissionNumber, challenge.numWinners)}`
                  : ""}
              </Text>
            </Box>
          );
        },
      }),
      columnHelper.display({
        id: "trailing",
        header: "",
        meta: { isTrailing: true },
        cell: ({ row }) => {
          const item = row.original;
          if (isFeedDeposit(item)) {
            return (
              <Flex h="100%" align="flex-start" justify="flex-end">
                <Text fontWeight="semibold" color="gray.700" lineHeight="1.2">
                  {item.points}
                </Text>
              </Flex>
            );
          }
          const s = item;
          const challenge = challenges[s.challengeId];
          const canManage = isAdmin || user.teamId === s.teamId;
          return (
            <Flex
              h="100%"
              minH="56px"
              direction="column"
              align="flex-end"
              justify="space-between"
              onClick={(e) => e.stopPropagation()}
            >
              <HStack spacing={0} align="flex-start">
                <Text
                  fontWeight="semibold"
                  color="gray.700"
                  lineHeight="1.2"
                  pt="6px"
                  pr={canManage ? 0 : 1}
                >
                  {challenge?.pts ?? "—"}
                </Text>
                {canManage ? (
                  <Menu>
                    <MenuButton
                      as={IconButton}
                      icon={<HiDotsVertical />}
                      variant="ghost"
                      size="sm"
                      aria-label="Options"
                      minW={7}
                      h={7}
                    />
                    <MenuList>
                      {isAdmin && (
                        <>
                          {!s.accepted && (
                            <MenuItem
                              onClick={() =>
                                void runAdminAction(s.id, "approve")
                              }
                            >
                              Approve
                            </MenuItem>
                          )}
                          {!s.rejected && (
                            <MenuItem
                              onClick={() =>
                                void runAdminAction(s.id, "reject")
                              }
                            >
                              Reject
                            </MenuItem>
                          )}
                          {(s.accepted || s.rejected) && (
                            <MenuItem
                              onClick={() =>
                                void runAdminAction(s.id, "reset")
                              }
                            >
                              Reset to pending
                            </MenuItem>
                          )}
                        </>
                      )}
                      <MenuItem onClick={() => editSubmission(s.id)}>
                        {s.mediaURL ? "Update media" : "Add media"}
                      </MenuItem>
                      {isAdmin && (
                        <MenuItem
                          onClick={() => void runAdminAction(s.id, "delete")}
                          color="red.600"
                        >
                          Delete
                        </MenuItem>
                      )}
                    </MenuList>
                  </Menu>
                ) : null}
              </HStack>
              <HStack spacing={0}>
                {isAdmin && sortId === "favorites" ? (
                  <Text fontSize="xs" color="gray.500" minW="14px">
                    {s.favoriteCount}
                  </Text>
                ) : null}
                <IconButton
                  aria-label="Toggle favorite"
                  icon={
                    s.favorited ? (
                      <LuHeart fill="currentColor" />
                    ) : (
                      <LuHeart />
                    )
                  }
                  onClick={() => toggleFavorite(s.id)}
                  variant="ghost"
                  color={s.favorited ? "red.500" : "gray.400"}
                  size="sm"
                  minW={7}
                  h={7}
                />
              </HStack>
            </Flex>
          );
        },
      }),
    ],
    [
      challenges,
      teams,
      neighborhoods,
      isAdmin,
      user.teamId,
      sortId,
      toggleFavorite,
      runAdminAction,
      editSubmission,
    ],
  );

  const scavTokNavButton = (
    <Button
      variant="outline"
      size="md"
      onClick={() => setQuery({ view: "tok", submission: null })}
    >
      ScavTok
    </Button>
  );

  if (view === "tok") {
    return (
      <NavContainer
        title="ScavTok"
        fullScreen
        hideTopBar
        hideMenu
        bgColor="black"
      >
        <ScavTokReel
          initialPage={tokInitialPage}
          userTeamId={user.teamId}
          defaultTab={teamIdFromQuery ? "foryou" : "following"}
          onBackToList={() => {
            if (teamIdFromQuery) {
              void router.push("/my-team");
              return;
            }
            setQuery({ view: "list", submission: null });
          }}
        />
      </NavContainer>
    );
  }

  return (
    <NavContainer title="Feed" right={scavTokNavButton} padTop={false}>
      <FeedWithAnnouncements pinned={pinnedAnnouncement}>
        {noFeedItemsAtAll ? (
          <Box
            flex="1"
            minH={0}
            overflowY="auto"
            data-nav-scroll
            bg="white"
            borderRadius={{ base: 0, md: "lg" }}
            py={12}
            px={4}
            textAlign="center"
          >
            <Text color="gray.400">Nothing in the feed yet</Text>
            <Text color="gray.400">Let the games begin!</Text>
          </Box>
        ) : (
          <>
            <DataListToolbar
              search={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Search by team or challenge…"
              sortOptions={sortOptions}
              sortId={sortId}
              onSortChange={(id) => setSortId(id as FeedSortId)}
              filterOptions={filterOptions}
              activeFilterIds={activeFilters}
              onToggleFilter={toggleFilter}
              onClearFilter={clearFilter}
            />
            <Box
              flex="1"
              minH={0}
              overflowY="auto"
              overflowX="hidden"
              data-nav-scroll
              px={4}
              pb="150px"
              w="100%"
              maxW="100%"
            >
              {feed.isLoading && visibleItems.length === 0 ? (
                <Flex justify="center" py={10}>
                  <Spinner color="gray.400" />
                </Flex>
              ) : (
                <DataList
                  rows={visibleItems}
                  columns={columns}
                  getRowId={(s) => s.id}
                  expandedId={selectedSubmission}
                  onToggle={(id) => {
                    toggleOpen(id);
                  }}
                  rowRef={rowRef}
                  isRowExpandable={isFeedSubmission}
                  emptyMessage="No activity matches"
                  renderExpanded={(row) => {
                    if (!isFeedSubmission(row)) return null;
                    const s = row;
                    const challenge = challenges[s.challengeId];
                    const team = teams[s.teamId];
                    if (!challenge || !team) return null;
                    const index = visibleItems.findIndex((i) => i.id === s.id);
                    return (
                      <FeedExpandedDetail
                        item={s}
                        index={index < 0 ? 0 : index}
                        team={team}
                        challenge={challenge}
                        queue={queue}
                        isOpen={selectedSubmission === s.id}
                        isAdmin={isAdmin}
                      />
                    );
                  }}
                />
              )}
              <Box ref={loadMoreRef} h={1} />
              {feed.isLoadingMore && (
                <Flex justify="center" my={4}>
                  <Spinner color="gray.400" />
                </Flex>
              )}
              {feed.error && (
                <Button
                  size="sm"
                  variant="outline"
                  mt={2}
                  onClick={() => feed.mutate()}
                >
                  Couldn&apos;t load more — retry
                </Button>
              )}
            </Box>
          </>
        )}
      </FeedWithAnnouncements>
    </NavContainer>
  );
}

type FeedExpandedProps = {
  item: FeedSubmissionItem;
  index: number;
  team: SerializedTeam;
  challenge: FeedChallenge;
  queue: PreloadQueue;
  isOpen: boolean;
  isAdmin: boolean;
};

const FeedExpandedDetail = memo(function FeedExpandedDetail({
  item: s,
  index,
  team,
  challenge,
  queue,
  isOpen,
  isAdmin,
}: FeedExpandedProps) {
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

  useEffect(() => {
    if (!isOpen || !isVideo) return;
    const v = videoRef.current;
    if (!v) return;
    markPlayIntent("tap");
    v.play().catch(() => undefined);
    return () => {
      v.pause();
    };
  }, [isOpen, isVideo, markPlayIntent]);

  const duration = formatDuration(s.durationSec);
  const aspect =
    s.width && s.height ? `${s.width} / ${s.height}` : "16 / 9";

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" color="gray.600">
        <Link
          href={`/teams?team=${s.teamId}`}
          fontWeight="medium"
          color="gray.700"
          _hover={{ textDecoration: "underline" }}
        >
          {team.emoji} {team.name}
        </Link>
        {!s.rejected && s.submissionNumber != null && (
          <>
            {" "}
            · {submissionStanding(s.submissionNumber, challenge.numWinners)}
          </>
        )}
        {duration ? ` · ${duration}` : ""}
      </Text>

      {isAdmin && challenge.prompt?.trim() ? (
        <Box>
          <Text
            fontSize="xs"
            fontWeight="semibold"
            color="gray.500"
            textTransform="uppercase"
            letterSpacing="wide"
            mb={1}
          >
            Prompt
          </Text>
          <Text
            fontSize="sm"
            color="gray.700"
            lineHeight="tall"
            sx={{
              "& a": {
                color: "blue.600",
                textDecoration: "underline",
              },
            }}
            dangerouslySetInnerHTML={{
              __html: challenge.prompt.replace(
                /(https?:\/\/[^\s]+)/g,
                '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
              ),
            }}
          />
        </Box>
      ) : null}

      {(isVideo || isImage) && (
        <Box
          ref={mediaRef}
          position="relative"
          width="100%"
          bg="gray.100"
          borderRadius="md"
          overflow="hidden"
          display="flex"
          justifyContent="center"
        >
          {isVideo && (
            <chakra.video
              ref={videoRef}
              controls
              playsInline
              poster={posterReady && s.posterURL ? s.posterURL : undefined}
              width="100%"
              maxWidth="800px"
              maxHeight="500px"
              objectFit="contain"
              sx={{ aspectRatio: aspect }}
            />
          )}
          {isImage &&
            (posterReady ? (
              <Image
                src={s.mediaURL!}
                alt={s.note}
                width="100%"
                maxHeight="500px"
                objectFit="contain"
              />
            ) : (
              <Box height="200px" width="100%" />
            ))}
        </Box>
      )}

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
          bg="white"
          p={3}
          borderRadius="md"
          borderLeft="3px solid"
          borderColor="gray.300"
        >
          <Text color="gray.700" lineHeight="tall">
            {s.note}
          </Text>
        </Box>
      )}

      <SubmissionComments submissionId={s.id} enabled={isOpen} />
    </VStack>
  );
});
