import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import dynamic from "next/dynamic";
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Heading,
  HStack,
  IconButton,
  Tag,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { LuHeart, LuList, LuMap } from "react-icons/lu";
import { useRouter } from "next/router";
import NavContainer from "../components/NavContainer";
import DataList from "../components/dataList/DataList";
import DataListToolbar from "../components/dataList/DataListToolbar";
import { publicUser, requireUserSSP, requireHuntAccessSSP } from "../lib/auth";
import { loadPlayerMapPayload } from "../lib/mapPayload";
import { findNeighborhoodAt } from "../lib/geo";
import { neighborhoodEmoji } from "../lib/neighborhoodEmoji";
import type { ChallengeWithSubsAndFav } from "../lib/challengeFavorites";

type LocationBadge =
  | { kind: "agnostic" }
  | { kind: "neighborhood"; id: string; name: string; emoji: string | null };

function challengeHasCoords(c: {
  lat: number | null;
  lng: number | null;
}): boolean {
  return (
    c.lat != null &&
    c.lng != null &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng)
  );
}

function locationBadgeFor(
  c: { lat: number | null; lng: number | null },
  neighborhoods: Array<{
    id: string;
    name: string;
    emoji: string | null;
    boundary: unknown;
    centerLat: number | null;
    centerLng: number | null;
  }>,
): LocationBadge {
  if (!challengeHasCoords(c)) return { kind: "agnostic" };
  const geo = neighborhoods
    .filter((n) => n.boundary != null)
    .map((n) => ({
      id: n.id,
      name: n.name,
      emoji: n.emoji,
      boundary: n.boundary,
      centerLat: n.centerLat,
      centerLng: n.centerLng,
    }));
  const hit = findNeighborhoodAt(c.lng!, c.lat!, geo);
  if (!hit) return { kind: "agnostic" };
  return {
    kind: "neighborhood",
    id: hit.id,
    name: hit.name,
    emoji: hit.emoji,
  };
}

function LocationTag({ badge }: { badge: LocationBadge }) {
  const tagProps = {
    size: "sm" as const,
    variant: "subtle" as const,
    flexShrink: 0,
    alignSelf: "flex-start",
    w: "fit-content",
    maxW: "100%",
    px: "10px",
    py: "3px",
  };
  if (badge.kind === "agnostic") {
    return (
      <Tag {...tagProps} colorScheme="gray">
        Location agnostic
      </Tag>
    );
  }
  return (
    <Tag {...tagProps} colorScheme="blue">
      {neighborhoodEmoji(badge.name, badge.emoji)} {badge.name}
    </Tag>
  );
}

const LeafletMap = dynamic(() => import("../components/leafletMap"), {
  ssr: false,
  loading: () => (
    <Flex h="100%" align="center" justify="center">
      <Text color="gray.500">Loading map…</Text>
    </Flex>
  ),
});

type SortOption =
  | "favorites"
  | "points-high"
  | "points-low"
  | "spots-left"
  | "a-z";
type ViewMode = "list" | "map";

const CHALLENGES_VIEW_KEY = "scavhunt.challengesView";

function readStoredChallengesView(): ViewMode {
  if (typeof window === "undefined") return "map";
  try {
    const stored = window.localStorage.getItem(CHALLENGES_VIEW_KEY);
    if (stored === "list" || stored === "map") return stored;
  } catch {
    /* ignore */
  }
  return "map";
}

function persistChallengesView(view: ViewMode) {
  try {
    window.localStorage.setItem(CHALLENGES_VIEW_KEY, view);
  } catch {
    /* ignore */
  }
}
type FilterId = "onlyFavorites" | "hideCompleted" | "hideFull";

const SORT_OPTIONS = [
  { id: "favorites", label: "Favorites" },
  { id: "points-high", label: "Points: High → Low" },
  { id: "points-low", label: "Points: Low → High" },
  { id: "spots-left", label: "Most spots left" },
  { id: "a-z", label: "A–Z" },
] as const;

const FILTER_OPTIONS: Array<{ id: FilterId; label: string }> = [
  { id: "onlyFavorites", label: "Team favorites only" },
  { id: "hideCompleted", label: "Hide finished" },
  { id: "hideFull", label: "Hide full" },
];

const columnHelper = createColumnHelper<ChallengeWithSubsAndFav>();

function spotsFilled(c: ChallengeWithSubsAndFav) {
  return c.submissions.filter((s) => s.accepted).length;
}
function spotsPending(c: ChallengeWithSubsAndFav) {
  return c.submissions.filter((s) => !s.accepted && !s.rejected).length;
}
function spotsLeft(c: ChallengeWithSubsAndFav) {
  return Math.max(0, c.numWinners - spotsFilled(c));
}

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const huntRedirect = await requireHuntAccessSSP(auth.user);
  if (huntRedirect) return { redirect: huntRedirect };

  const mapPayload = await loadPlayerMapPayload(auth.user);

  return {
    props: {
      user: publicUser(auth.user),
      ...mapPayload,
    },
  };
};

export default function ChallengesPage({
  challenges: initialChallenges,
  locations,
  teams,
  team,
  territoryEnabled,
  isAdmin,
  neighborhoods,
  bank,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const toast = useToast();

  const viewParam = router.query.view;
  const explicitView: ViewMode | null =
    viewParam === "map" || viewParam === "list" ? viewParam : null;
  const view: ViewMode = explicitView ?? "map";

  useEffect(() => {
    if (!router.isReady) return;
    if (explicitView) {
      persistChallengesView(explicitView);
      return;
    }
    const prefer = readStoredChallengesView();
    const query: Record<string, string> = { view: prefer };
    if (typeof router.query.challenge === "string") {
      query.challenge = router.query.challenge;
    }
    if (typeof router.query.neighborhood === "string") {
      query.neighborhood = router.query.neighborhood;
    }
    if (
      router.query.replay === "1" ||
      router.query.replay === "true"
    ) {
      query.view = "map";
      query.replay = "1";
    }
    void router.replace({ pathname: "/challenges", query }, undefined, {
      shallow: true,
    });
  }, [
    router.isReady,
    explicitView,
    router.query.challenge,
    router.query.neighborhood,
    router.query.replay,
    router.replace,
  ]);
  const challengeParam =
    typeof router.query.challenge === "string"
      ? router.query.challenge
      : null;
  const neighborhoodParam =
    typeof router.query.neighborhood === "string"
      ? router.query.neighborhood
      : null;
  const autoOpenReplay =
    router.query.replay === "1" || router.query.replay === "true";
  // Deep-link zoom only on the first map paint for this page load.
  const [zoomChallengeOnce, setZoomChallengeOnce] = useState<string | null>(
    () =>
      viewParam !== "list" && typeof router.query.challenge === "string"
        ? router.query.challenge
        : null,
  );
  const [zoomNeighborhoodOnce, setZoomNeighborhoodOnce] = useState<
    string | null
  >(
    () =>
      viewParam !== "list" && typeof router.query.neighborhood === "string"
        ? router.query.neighborhood
        : null,
  );

  const [challenges, setChallenges] =
    useState<ChallengeWithSubsAndFav[]>(initialChallenges);
  const [sortOption, setSortOption] = useState<SortOption>("favorites");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<FilterId[]>([
    "hideCompleted",
    "hideFull",
  ]);
  const [favBusyId, setFavBusyId] = useState<string | null>(null);
  const [mapNeighborhoods, setMapNeighborhoods] = useState(neighborhoods);

  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    setChallenges(initialChallenges);
  }, [initialChallenges]);

  useEffect(() => {
    setMapNeighborhoods(neighborhoods);
  }, [neighborhoods]);

  useEffect(() => {
    if (view !== "list" || !challengeParam) return;
    rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [view, challengeParam]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(
          view === "map" ? "/api/map-live" : "/api/challenges",
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.challenges)) setChallenges(data.challenges);
        if (Array.isArray(data.neighborhoods)) {
          setMapNeighborhoods(data.neighborhoods);
        }
      } catch {
        /* ignore */
      }
    };
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [view]);

  const setQuery = useCallback(
    (patch: {
      view?: ViewMode;
      challenge?: string | null;
      neighborhood?: string | null;
    }) => {
      const nextView = patch.view ?? view;
      let nextChallenge =
        patch.challenge === undefined ? challengeParam : patch.challenge;
      let nextNeighborhood =
        patch.neighborhood === undefined
          ? neighborhoodParam
          : patch.neighborhood;

      // Mutual exclusion + list view ignores neighborhoods.
      if (nextView === "list") nextNeighborhood = null;
      if (patch.challenge !== undefined && patch.challenge) {
        nextNeighborhood = null;
      }
      if (patch.neighborhood !== undefined && patch.neighborhood) {
        nextChallenge = null;
      }

      persistChallengesView(nextView);
      const query: Record<string, string> = { view: nextView };
      if (nextChallenge) query.challenge = nextChallenge;
      if (nextNeighborhood) query.neighborhood = nextNeighborhood;
      void router.push({ pathname: "/challenges", query }, undefined, {
        shallow: true,
      });
    },
    [router, view, challengeParam, neighborhoodParam],
  );

  const toggleFavorite = useCallback(
    async (challengeId: string) => {
      if (!team) {
        toast({
          title: "Join a team to favorite challenges",
          status: "warning",
        });
        return;
      }
      setFavBusyId(challengeId);
      const prev = challenges.find((c) => c.id === challengeId)?.favorited;
      setChallenges((list) =>
        list.map((c) =>
          c.id === challengeId ? { ...c, favorited: !c.favorited } : c,
        ),
      );
      try {
        const res = await fetch("/api/toggle-challenge-favorite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setChallenges((list) =>
            list.map((c) =>
              c.id === challengeId ? { ...c, favorited: Boolean(prev) } : c,
            ),
          );
          toast({ title: data.error || "Favorite failed", status: "error" });
          return;
        }
        setChallenges((list) =>
          list.map((c) =>
            c.id === challengeId
              ? { ...c, favorited: Boolean(data.favorited) }
              : c,
          ),
        );
      } catch {
        setChallenges((list) =>
          list.map((c) =>
            c.id === challengeId ? { ...c, favorited: Boolean(prev) } : c,
          ),
        );
        toast({ title: "Favorite failed", status: "error" });
      } finally {
        setFavBusyId(null);
      }
    },
    [challenges, team, toast],
  );

  const hideCompleted = activeFilters.includes("hideCompleted");
  const hideFull = activeFilters.includes("hideFull");
  const onlyFavorites = activeFilters.includes("onlyFavorites");

  const sortedChallenges = useMemo(() => {
    let list = challenges;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.prompt.toLowerCase().includes(q),
      );
    }
    if (hideCompleted && team) {
      list = list.filter(
        (c) =>
          !c.submissions.some((s) => s.teamId === team.id && s.accepted),
      );
    }
    if (hideFull) {
      list = list.filter((c) => spotsFilled(c) < c.numWinners);
    }
    if (onlyFavorites) {
      list = list.filter((c) => c.favorited);
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortOption === "favorites") {
        if (a.favorited !== b.favorited) return a.favorited ? -1 : 1;
        return 0;
      }
      if (sortOption === "points-high") return b.pts - a.pts;
      if (sortOption === "points-low") return a.pts - b.pts;
      if (sortOption === "spots-left") return spotsLeft(b) - spotsLeft(a);
      if (sortOption === "a-z") {
        return a.title.localeCompare(b.title, undefined, {
          sensitivity: "base",
        });
      }
      return 0;
    });
    return sorted;
  }, [
    challenges,
    searchQuery,
    hideCompleted,
    hideFull,
    onlyFavorites,
    sortOption,
    team,
  ]);

  const toggleFilter = useCallback((id: string) => {
    const fid = id as FilterId;
    setActiveFilters((prev) =>
      prev.includes(fid) ? prev.filter((x) => x !== fid) : [...prev, fid],
    );
  }, []);

  const clearFilter = useCallback((id: string) => {
    setActiveFilters((prev) => prev.filter((x) => x !== id));
  }, []);

  const teamCompleted = useCallback(
    (c: ChallengeWithSubsAndFav) =>
      !!team &&
      c.submissions.some((s) => s.teamId === team.id && s.accepted),
    [team],
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "primary",
        header: "Challenge",
        cell: ({ row }) => {
          const c = row.original;
          const filled = spotsFilled(c);
          const pending = spotsPending(c);
          const done = teamCompleted(c);
          const badge = locationBadgeFor(c, mapNeighborhoods);
          return (
            <Box minW={0}>
              <Flex align="center" gap={2} minW={0} flexWrap="wrap">
                <Text
                  fontWeight="semibold"
                  color="gray.800"
                  noOfLines={2}
                  lineHeight="short"
                >
                  {c.emoji ? `${c.emoji} ${c.title}` : c.title}
                </Text>
                {done && (
                  <Tag size="sm" colorScheme="green" flexShrink={0}>
                    Done
                  </Tag>
                )}
              </Flex>
              <Flex mt={1} align="center" gap={2} flexWrap="wrap">
                <LocationTag badge={badge} />
                <Text fontSize="sm" color="gray.500" noOfLines={1}>
                  {`${filled} of ${c.numWinners} spot${
                    c.numWinners === 1 ? "" : "s"
                  }${pending > 0 ? ` · ${pending} pending` : ""}`}
                </Text>
              </Flex>
            </Box>
          );
        },
      }),
      columnHelper.display({
        id: "spots",
        header: "Spots",
        meta: { hideBelow: "md", numeric: true },
        cell: ({ row }) => {
          const c = row.original;
          return (
            <Text fontSize="sm" color="gray.600">
              {spotsFilled(c)}/{c.numWinners}
            </Text>
          );
        },
      }),
      columnHelper.display({
        id: "pts",
        header: "Pts",
        meta: { numeric: true },
        cell: ({ row }) => (
          <Text fontWeight="semibold" color="gray.700">
            {row.original.pts}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "fav",
        header: "",
        meta: { isAction: true },
        cell: ({ row }) => {
          const c = row.original;
          if (!team) return null;
          return (
            <IconButton
              aria-label={
                c.favorited ? "Unfavorite for team" : "Favorite for team"
              }
              icon={
                c.favorited ? (
                  <LuHeart fill="currentColor" />
                ) : (
                  <LuHeart />
                )
              }
              size="sm"
              variant="ghost"
              color={c.favorited ? "pink.500" : "gray.400"}
              isLoading={favBusyId === c.id}
              onClick={() => void toggleFavorite(c.id)}
            />
          );
        },
      }),
    ],
    [team, teamCompleted, favBusyId, toggleFavorite, mapNeighborhoods],
  );

  const selected = useMemo(
    () => challenges.find((c) => c.id === challengeParam) ?? null,
    [challenges, challengeParam],
  );

  const selectedTerritoryNeighborhood = useMemo(
    () =>
      neighborhoodParam
        ? (mapNeighborhoods.find((n) => n.id === neighborhoodParam) ?? null)
        : null,
    [mapNeighborhoods, neighborhoodParam],
  );

  const mapNavButton = (
    <IconButton
      aria-label={view === "map" ? "Show challenge list" : "Show map"}
      icon={view === "map" ? <LuList /> : <LuMap />}
      variant="outline"
      size="md"
      onClick={() =>
        setQuery({
          view: view === "map" ? "list" : "map",
          challenge: null,
          neighborhood: null,
        })
      }
    />
  );

  const challengeDetails = (c: ChallengeWithSubsAndFav) => {
    const accepted = c.submissions.filter((s) => s.accepted).length;
    const pending = c.submissions.filter(
      (s) => !s.accepted && !s.rejected,
    ).length;
    return (
      <VStack align="stretch" spacing={2}>
        <Text fontSize="sm" color="gray.600">
          {`${accepted} of ${c.numWinners} spot${
            c.numWinners === 1 ? "" : "s"
          } filled • ${pending} pending approval`}
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
            __html: c.prompt.replace(
              /(https?:\/\/[^\s]+)/g,
              '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
            ),
          }}
        />
      </VStack>
    );
  };

  const neighborhoodDrawerBody = selectedTerritoryNeighborhood && (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" color="gray.600">
        {selectedTerritoryNeighborhood.contested
          ? "Contested"
          : selectedTerritoryNeighborhood.claimedBy
            ? `${selectedTerritoryNeighborhood.claimedBy.teamEmoji} ${selectedTerritoryNeighborhood.claimedBy.teamName} (${selectedTerritoryNeighborhood.claimedBy.points} pts)`
            : "Unclaimed"}
      </Text>
      {selectedTerritoryNeighborhood.totals.length > 0 && (
        <VStack align="stretch" spacing={1}>
          {selectedTerritoryNeighborhood.totals.slice(0, 8).map((t) => (
            <HStack key={t.teamId} justify="space-between" fontSize="sm">
              <Text>
                {t.teamEmoji} {t.teamName}
              </Text>
              <Text fontWeight="semibold">{t.points}</Text>
            </HStack>
          ))}
        </VStack>
      )}
    </VStack>
  );

  if (view === "map") {
    return (
      <NavContainer title="Challenges" fullScreen right={mapNavButton}>
        <Box position="relative" flex={1} w="100%" h="100%" minH={0}>
          <LeafletMap
            challenges={challenges}
            locations={locations}
            teams={teams}
            team={team}
            territoryEnabled={territoryEnabled}
            isAdmin={isAdmin}
            initialNeighborhoods={mapNeighborhoods}
            initialBank={bank}
            selectedChallengeId={challengeParam}
            selectedNeighborhoodId={neighborhoodParam}
            zoomChallengeId={zoomChallengeOnce}
            zoomNeighborhoodId={zoomNeighborhoodOnce}
            autoOpenReplay={autoOpenReplay}
            onDeepLinkZoomConsumed={(kind) => {
              if (kind === "challenge") setZoomChallengeOnce(null);
              if (kind === "neighborhood") setZoomNeighborhoodOnce(null);
            }}
            onSelectChallenge={(id) =>
              setQuery({ view: "map", challenge: id, neighborhood: null })
            }
            onSelectNeighborhood={(id) =>
              setQuery({ view: "map", neighborhood: id, challenge: null })
            }
          />
          <Drawer
            isOpen={!!selected}
            placement="bottom"
            onClose={() => setQuery({ view: "map", challenge: null })}
            size="md"
            blockScrollOnMount={false}
            autoFocus={false}
            trapFocus={false}
            closeOnOverlayClick={false}
          >
            <DrawerOverlay bg="blackAlpha.200" pointerEvents="none" />
            <DrawerContent
              pointerEvents="auto"
              containerProps={{ pointerEvents: "none" }}
              borderTopRadius="xl"
              maxH="85dvh"
              mx="auto"
              maxW={{ base: "100%", md: "560px" }}
              boxShadow="0 -8px 30px rgba(0,0,0,0.18)"
            >
              <DrawerCloseButton />
              <DrawerHeader pr={12} pb={2}>
                <Box minW={0}>
                  <Heading size="md" noOfLines={2}>
                    {selected
                      ? selected.emoji
                        ? `${selected.emoji} ${selected.title}`
                        : selected.title
                      : ""}
                  </Heading>
                  {selected && (
                    <VStack align="stretch" spacing={1} mt={1}>
                      <HStack spacing={1} align="center">
                        <Text
                          fontSize="sm"
                          color="gray.500"
                          fontWeight="semibold"
                        >
                          {selected.pts} pts
                        </Text>
                        {team && (
                          <IconButton
                            aria-label={
                              selected.favorited
                                ? "Unfavorite for team"
                                : "Favorite for team"
                            }
                            icon={
                              selected.favorited ? (
                                <LuHeart fill="currentColor" />
                              ) : (
                                <LuHeart />
                              )
                            }
                            color={
                              selected.favorited ? "pink.500" : "gray.400"
                            }
                            variant="ghost"
                            size="xs"
                            minW={6}
                            h={6}
                            isLoading={favBusyId === selected.id}
                            onClick={() => void toggleFavorite(selected.id)}
                          />
                        )}
                      </HStack>
                      <LocationTag
                        badge={locationBadgeFor(selected, mapNeighborhoods)}
                      />
                    </VStack>
                  )}
                </Box>
              </DrawerHeader>
              <DrawerBody overflowY="auto" pt={1}>
                {selected && challengeDetails(selected)}
              </DrawerBody>
              {team && selected && (
                <DrawerFooter
                  borderTopWidth="1px"
                  pb={{ base: "max(1rem, env(safe-area-inset-bottom))", sm: 4 }}
                >
                  <Button
                    colorScheme="blue"
                    w="100%"
                    size="lg"
                    onClick={() => void router.push(`/submit/${selected.id}`)}
                  >
                    Submit Challenge
                  </Button>
                </DrawerFooter>
              )}
            </DrawerContent>
          </Drawer>
          <Drawer
            isOpen={!!selectedTerritoryNeighborhood}
            placement="bottom"
            onClose={() => setQuery({ view: "map", neighborhood: null })}
            size="md"
            blockScrollOnMount={false}
            autoFocus={false}
            trapFocus={false}
            closeOnOverlayClick={false}
          >
            <DrawerOverlay bg="blackAlpha.200" pointerEvents="none" />
            <DrawerContent
              pointerEvents="auto"
              containerProps={{ pointerEvents: "none" }}
              borderTopRadius="xl"
              maxH="70dvh"
              mx="auto"
              maxW={{ base: "100%", md: "560px" }}
              boxShadow="0 -8px 30px rgba(0,0,0,0.18)"
            >
              <DrawerCloseButton />
              <DrawerHeader pr={12}>
                <Heading size="md" noOfLines={2}>
                  {selectedTerritoryNeighborhood
                    ? selectedTerritoryNeighborhood.claimedBy
                      ? `${selectedTerritoryNeighborhood.claimedBy.teamEmoji} ${selectedTerritoryNeighborhood.name}`
                      : selectedTerritoryNeighborhood.contested
                        ? `~ ${selectedTerritoryNeighborhood.name}`
                        : selectedTerritoryNeighborhood.name
                    : ""}
                </Heading>
              </DrawerHeader>
              <DrawerBody overflowY="auto" pb={6}>
                {neighborhoodDrawerBody}
              </DrawerBody>
            </DrawerContent>
          </Drawer>
        </Box>
      </NavContainer>
    );
  }

  return (
    <NavContainer title="Challenges" right={mapNavButton} padTop={false}>
      <DataListToolbar
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search challenges…"
        sortOptions={[...SORT_OPTIONS]}
        sortId={sortOption}
        onSortChange={(id) => setSortOption(id as SortOption)}
        filterOptions={
          team
            ? FILTER_OPTIONS
            : FILTER_OPTIONS.filter((f) => f.id === "hideFull")
        }
        activeFilterIds={
          team
            ? activeFilters
            : activeFilters.filter((f) => f === "hideFull")
        }
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
        <DataList
          rows={sortedChallenges}
          columns={columns}
          getRowId={(c) => c.id}
          expandedId={challengeParam}
          onToggle={(id) =>
            setQuery({
              view: "list",
              challenge: id === challengeParam ? null : id,
            })
          }
          rowRef={rowRef}
          emptyMessage="No challenges match"
          renderExpanded={(c) => (
            <VStack align="stretch" spacing={3}>
              {challengeDetails(c)}
              {team != null && (
                <HStack flexWrap="wrap">
                  <Button
                    colorScheme="blue"
                    size="md"
                    onClick={() => void router.push(`/submit/${c.id}`)}
                  >
                    Submit Challenge
                  </Button>
                  <Button
                    size="md"
                    variant="outline"
                    leftIcon={<LuMap />}
                    onClick={() => setQuery({ view: "map", challenge: c.id })}
                  >
                    Show on map
                  </Button>
                </HStack>
              )}
            </VStack>
          )}
        />
      </Box>
    </NavContainer>
  );
}
