import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import dynamic from "next/dynamic";
import {
  Box,
  Button,
  Card,
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
  Input,
  Select,
  Switch,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai";
import { FiList, FiMap } from "react-icons/fi";
import { useRouter } from "next/router";
import NavContainer from "../components/NavContainer";
import { publicUser, requireUserSSP } from "../lib/auth";
import { requireHuntStartedSSP } from "../lib/time";
import { loadPlayerMapPayload } from "../lib/mapPayload";
import { findNeighborhoodAt } from "../lib/geo";
import { neighborhoodEmoji } from "../lib/neighborhoodEmoji";
import type { ChallengeWithSubsAndFav } from "../lib/challengeFavorites";

const LeafletMap = dynamic(() => import("../components/leafletMap"), {
  ssr: false,
  loading: () => (
    <Flex h="100%" align="center" justify="center">
      <Text color="gray.500">Loading map…</Text>
    </Flex>
  ),
});

type SortOption = "default" | "points-high" | "points-low";
type ViewMode = "list" | "map";

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const huntRedirect = await requireHuntStartedSSP(auth.user.isAdmin);
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
  team,
  territoryEnabled,
  isAdmin,
  neighborhoods,
  bank,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const toast = useToast();

  const viewParam = router.query.view;
  const view: ViewMode =
    viewParam === "map" || viewParam === "list" ? viewParam : "list";
  const challengeParam =
    typeof router.query.challenge === "string"
      ? router.query.challenge
      : null;

  const [challenges, setChallenges] =
    useState<ChallengeWithSubsAndFav[]>(initialChallenges);
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [searchQuery, setSearchQuery] = useState("");
  const [hideCompleted, setHideCompleted] = useState(true);
  const [hideFullChallenges, setHideFullChallenges] = useState(true);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favBusyId, setFavBusyId] = useState<string | null>(null);
  const [mapNeighborhoods, setMapNeighborhoods] = useState(neighborhoods);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChallenges(initialChallenges);
  }, [initialChallenges]);

  useEffect(() => {
    setMapNeighborhoods(neighborhoods);
  }, [neighborhoods]);

  useEffect(() => {
    if (view !== "list" || !challengeParam) return;
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
    (patch: { view?: ViewMode; challenge?: string | null }) => {
      const nextView = patch.view ?? view;
      const nextChallenge =
        patch.challenge === undefined ? challengeParam : patch.challenge;
      const query: Record<string, string> = { view: nextView };
      if (nextChallenge) query.challenge = nextChallenge;
      void router.push({ pathname: "/challenges", query }, undefined, {
        shallow: true,
      });
    },
    [router, view, challengeParam],
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

  const searchFiltered =
    searchQuery.trim() === ""
      ? challenges
      : challenges.filter(
          (c) =>
            c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.prompt.toLowerCase().includes(searchQuery.toLowerCase()),
        );

  const completedFiltered =
    hideCompleted && team
      ? searchFiltered.filter(
          (c) =>
            !c.submissions.some((s) => s.teamId === team.id && s.accepted),
        )
      : searchFiltered;

  const capacityFiltered = hideFullChallenges
    ? completedFiltered.filter(
        (c) => c.submissions.filter((s) => s.accepted).length < c.numWinners,
      )
    : completedFiltered;

  const favoritesFiltered = onlyFavorites
    ? capacityFiltered.filter((c) => c.favorited)
    : capacityFiltered;

  const sortedChallenges =
    sortOption === "default"
      ? favoritesFiltered
      : [...favoritesFiltered].sort((a, b) => {
          if (sortOption === "points-high") return b.pts - a.pts;
          if (sortOption === "points-low") return a.pts - b.pts;
          return 0;
        });

  const selected = useMemo(
    () => challenges.find((c) => c.id === challengeParam) ?? null,
    [challenges, challengeParam],
  );

  const selectedNeighborhood = useMemo(() => {
    if (
      !selected ||
      selected.lat == null ||
      selected.lng == null ||
      !Number.isFinite(selected.lat) ||
      !Number.isFinite(selected.lng)
    ) {
      return null;
    }
    const geo = mapNeighborhoods
      .filter((n) => n.boundary != null)
      .map((n) => ({
        id: n.id,
        name: n.name,
        emoji: n.emoji,
        boundary: n.boundary,
        centerLat: n.centerLat,
        centerLng: n.centerLng,
      }));
    return findNeighborhoodAt(selected.lng, selected.lat, geo);
  }, [selected, mapNeighborhoods]);

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
        List
      </Button>
      <Button
        size="sm"
        leftIcon={<FiMap />}
        variant={view === "map" ? "solid" : "ghost"}
        colorScheme={view === "map" ? "blue" : "gray"}
        onClick={() => setQuery({ view: "map" })}
      >
        Map
      </Button>
    </HStack>
  );

  const challengeDetails = (c: ChallengeWithSubsAndFav) => {
    const accepted = c.submissions.filter((s) => s.accepted).length;
    const pending = c.submissions.filter(
      (s) => !s.accepted && !s.rejected,
    ).length;
    return (
      <VStack align="stretch" spacing={3}>
        {selectedNeighborhood && (
          <Text fontSize="sm" color="gray.600">
            {neighborhoodEmoji(
              selectedNeighborhood.name,
              selectedNeighborhood.emoji,
            )}{" "}
            {selectedNeighborhood.name}
          </Text>
        )}
        <Text fontSize="sm" color="gray.600">
          {accepted} of {c.numWinners} spot
          {c.numWinners === 1 ? "" : "s"} filled • {pending} pending approval
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

  if (view === "map") {
    return (
      <NavContainer title="Challenges" fullScreen hideTopBar>
        <Box position="relative" flex={1} w="100%" h="100%" minH={0}>
          <Box position="absolute" top={4} left={4} zIndex={1100}>
            {viewToggle}
          </Box>
          <LeafletMap
            challenges={challenges}
            locations={locations}
            team={team}
            territoryEnabled={territoryEnabled}
            isAdmin={isAdmin}
            initialNeighborhoods={mapNeighborhoods}
            initialBank={bank}
            selectedChallengeId={challengeParam}
            onSelectChallenge={(id) =>
              setQuery({ view: "map", challenge: id })
            }
          />
          <Drawer
            isOpen={!!selected}
            placement="bottom"
            onClose={() => setQuery({ view: "map", challenge: null })}
            size="md"
          >
            <DrawerOverlay />
            <DrawerContent
              borderTopRadius="xl"
              maxH="85dvh"
              mx="auto"
              maxW={{ base: "100%", md: "560px" }}
            >
              <DrawerCloseButton />
              <DrawerHeader pr={12}>
                <HStack justify="space-between" align="flex-start" gap={3}>
                  <Box minW={0}>
                    <Heading size="md" noOfLines={2}>
                      {selected
                        ? selected.emoji
                          ? `${selected.emoji} ${selected.title}`
                          : selected.title
                        : ""}
                    </Heading>
                    {selected && (
                      <Text fontSize="sm" color="gray.500" mt={1}>
                        {selected.pts} pts
                      </Text>
                    )}
                  </Box>
                  {team && selected && (
                    <IconButton
                      aria-label={
                        selected.favorited
                          ? "Unfavorite for team"
                          : "Favorite for team"
                      }
                      icon={
                        selected.favorited ? (
                          <AiFillHeart />
                        ) : (
                          <AiOutlineHeart />
                        )
                      }
                      color={selected.favorited ? "pink.500" : "gray.400"}
                      variant="ghost"
                      isLoading={favBusyId === selected.id}
                      onClick={() => void toggleFavorite(selected.id)}
                    />
                  )}
                </HStack>
              </DrawerHeader>
              <DrawerBody overflowY="auto">
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
        </Box>
      </NavContainer>
    );
  }

  return (
    <NavContainer title="Challenges">
      <VStack spacing={4} align="stretch">
        <HStack justify="space-between" flexWrap="wrap" gap={2}>
          <Input
            placeholder="Search challenges..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            flex="1"
            minW="160px"
            bg="white"
            borderRadius="md"
            boxShadow="sm"
            size="md"
          />
          {viewToggle}
        </HStack>
        <Select
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value as SortOption)}
          width="100%"
          bg="white"
          borderRadius="md"
          boxShadow="sm"
        >
          <option value="default">Default</option>
          <option value="points-high">Points: High to Low</option>
          <option value="points-low">Points: Low to High</option>
        </Select>
        {team && (
          <VStack width="100%" spacing={2}>
            <HStack
              width="100%"
              bg="white"
              p={3}
              borderRadius="md"
              boxShadow="sm"
              justifyContent="space-between"
            >
              <Text fontSize="sm" fontWeight="medium" color="gray.700">
                Only show team favorites
              </Text>
              <Switch
                isChecked={onlyFavorites}
                onChange={(e) => setOnlyFavorites(e.target.checked)}
                colorScheme="pink"
              />
            </HStack>
            <HStack
              width="100%"
              bg="white"
              p={3}
              borderRadius="md"
              boxShadow="sm"
              justifyContent="space-between"
            >
              <Text fontSize="sm" fontWeight="medium" color="gray.700">
                Hide challenges you&apos;ve finished
              </Text>
              <Switch
                isChecked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
                colorScheme="blue"
              />
            </HStack>
            <HStack
              width="100%"
              bg="white"
              p={3}
              borderRadius="md"
              boxShadow="sm"
              justifyContent="space-between"
            >
              <Text fontSize="sm" fontWeight="medium" color="gray.700">
                Hide challenges at max capacity
              </Text>
              <Switch
                isChecked={hideFullChallenges}
                onChange={(e) => setHideFullChallenges(e.target.checked)}
                colorScheme="blue"
              />
            </HStack>
          </VStack>
        )}
        {sortedChallenges.map((c) => {
          const isOpen = c.id === challengeParam;
          return (
            <Card
              ref={c.id === challengeParam ? ref : null}
              key={c.id}
              width="100%"
              className={isOpen ? "card open" : "card"}
              boxShadow="sm"
              _hover={{ boxShadow: "md" }}
              transition="all 0.2s"
              borderRadius="lg"
              borderWidth={c.favorited ? "2px" : undefined}
              borderColor={c.favorited ? "pink.300" : undefined}
            >
              <Flex direction="column">
                <Flex
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  p={4}
                  gap={3}
                  cursor="pointer"
                  onClick={() =>
                    setQuery({
                      view: "list",
                      challenge: isOpen ? null : c.id,
                    })
                  }
                >
                  <Heading size="md" flex={1} color="gray.800">
                    {c.emoji ? `${c.emoji} ${c.title}` : c.title}
                  </Heading>
                  <Flex alignItems="center" gap={1}>
                    {team && (
                      <IconButton
                        aria-label={
                          c.favorited
                            ? "Unfavorite for team"
                            : "Favorite for team"
                        }
                        icon={
                          c.favorited ? <AiFillHeart /> : <AiOutlineHeart />
                        }
                        size="sm"
                        variant="ghost"
                        color={c.favorited ? "pink.500" : "gray.400"}
                        isLoading={favBusyId === c.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleFavorite(c.id);
                        }}
                      />
                    )}
                    <Text
                      fontWeight="semibold"
                      color="gray.700"
                      fontSize="md"
                    >
                      {c.pts} pts
                    </Text>
                    <ChevronDownIcon
                      w={5}
                      h={5}
                      color="gray.500"
                      className={isOpen ? "chevron rotate" : "chevron"}
                    />
                  </Flex>
                </Flex>
                <Flex direction="row" px={4} pb={isOpen ? 2 : 4}>
                  <Text fontSize="sm" color="gray.600">
                    {c.submissions.filter((s) => s.accepted).length} of{" "}
                    {c.numWinners} spot
                    {c.numWinners === 1 ? "" : "s"} filled •{" "}
                    {
                      c.submissions.filter((s) => !s.accepted && !s.rejected)
                        .length
                    }{" "}
                    pending approval
                  </Text>
                </Flex>
                {isOpen && (
                  <VStack
                    px={4}
                    pb={4}
                    spacing={3}
                    alignItems="left"
                    borderTop="1px"
                    borderColor="gray.100"
                    pt={3}
                    className="expandable-content"
                  >
                    {challengeDetails(c)}
                    {team != null && (
                      <HStack>
                        <Button
                          colorScheme="blue"
                          size="md"
                          onClick={(e) => {
                            e.stopPropagation();
                            void router.push(`/submit/${c.id}`);
                          }}
                          width="fit-content"
                        >
                          Submit Challenge
                        </Button>
                        <Button
                          size="md"
                          variant="outline"
                          leftIcon={<FiMap />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuery({ view: "map", challenge: c.id });
                          }}
                        >
                          Show on map
                        </Button>
                      </HStack>
                    )}
                  </VStack>
                )}
              </Flex>
            </Card>
          );
        })}
      </VStack>
    </NavContainer>
  );
}
