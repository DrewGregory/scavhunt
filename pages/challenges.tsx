import { GetServerSideProps } from "next";
import {
  Button,
  Card,
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
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai";
import { useRouter, useSearchParams } from "next/navigation";
import NavContainer from "../components/NavContainer";
import { useSession } from "../components/useSession";
import { requireUserSSP } from "../lib/auth";
import { requireHuntStartedSSP } from "../lib/time";
import {
  listEnabledChallengesWithSubs,
  type ChallengeWithSubsAndFav,
} from "../lib/challengeFavorites";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const huntRedirect = await requireHuntStartedSSP(auth.user.isAdmin);
  if (huntRedirect) return { redirect: huntRedirect };

  const challenges = await listEnabledChallengesWithSubs(auth.user.teamId);

  return { props: { challenges } };
};

type SortOption = "default" | "points-high" | "points-low";

export default function Page({
  challenges: initialChallenges,
}: {
  challenges: Array<ChallengeWithSubsAndFav>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const challengeSearchParam = searchParams.get("challenge");
  const toast = useToast();
  const [challenges, setChallenges] = useState(initialChallenges);
  const [selectedChallenge, setSelectedChallenge] = useState<string | null>(
    challengeSearchParam,
  );
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [hideCompleted, setHideCompleted] = useState<boolean>(true);
  const [hideFullChallenges, setHideFullChallenges] = useState<boolean>(true);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favBusyId, setFavBusyId] = useState<string | null>(null);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChallenges(initialChallenges);
  }, [initialChallenges]);

  useEffect(() => {
    const current = ref.current;
    if (current != null) {
      current.scrollIntoView();
    }
  }, [challengeSearchParam]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/challenges");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.challenges)) {
          setChallenges(data.challenges);
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
  }, []);

  const session = useSession();
  const team = session?.team;

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

  const searchFilteredChallenges =
    searchQuery.trim() === ""
      ? challenges
      : challenges.filter(
          (c) =>
            c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.prompt.toLowerCase().includes(searchQuery.toLowerCase()),
        );

  const completedFilteredChallenges =
    hideCompleted && team
      ? searchFilteredChallenges.filter(
          (c) =>
            !c.submissions.some((s) => s.teamId === team.id && s.accepted),
        )
      : searchFilteredChallenges;

  const fullFilteredChallenges = hideFullChallenges
    ? completedFilteredChallenges.filter(
        (c) => c.submissions.filter((s) => s.accepted).length < c.numWinners,
      )
    : completedFilteredChallenges;

  const favoritesFiltered = onlyFavorites
    ? fullFilteredChallenges.filter((c) => c.favorited)
    : fullFilteredChallenges;

  const sortedChallenges =
    sortOption === "default"
      ? favoritesFiltered
      : [...favoritesFiltered].sort((a, b) => {
          switch (sortOption) {
            case "points-high":
              return b.pts - a.pts;
            case "points-low":
              return a.pts - b.pts;
            default:
              return 0;
          }
        });

  return (
    <NavContainer title="Challenges">
      <VStack spacing={4}>
        <Input
          placeholder="Search challenges..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          width="100%"
          bg="white"
          borderRadius="md"
          boxShadow="sm"
          size="md"
        />
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
        {sortedChallenges.map((c) => (
          <Card
            ref={c.id === challengeSearchParam ? ref : null}
            key={c.id}
            width="100%"
            className={c.id === selectedChallenge ? "card open" : "card"}
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
                onClick={() => {
                  setSelectedChallenge(
                    c.id === selectedChallenge ? null : c.id,
                  );
                }}
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
                  <Text fontWeight="semibold" color="gray.700" fontSize="md">
                    {c.pts} pts
                  </Text>
                  <ChevronDownIcon
                    w={5}
                    h={5}
                    color="gray.500"
                    className={
                      c.id === selectedChallenge ? "chevron rotate" : "chevron"
                    }
                  />
                </Flex>
              </Flex>
              <Flex
                direction="row"
                px={4}
                pb={c.id === selectedChallenge ? 2 : 4}
              >
                <Text fontSize="sm" color="gray.600">
                  {c.submissions.filter((s) => s.accepted).length} of{" "}
                  {c.numWinners} spot{c.numWinners === 1 ? "" : "s"} filled •{" "}
                  {
                    c.submissions.filter((s) => !s.accepted && !s.rejected)
                      .length
                  }{" "}
                  pending approval
                </Text>
              </Flex>
              {c.id === selectedChallenge && (
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
                  <Text
                    fontSize="sm"
                    color="gray.700"
                    lineHeight="tall"
                    sx={{
                      "& a": {
                        color: "blue.600",
                        textDecoration: "underline",
                        _hover: {
                          color: "blue.700",
                        },
                      },
                    }}
                    dangerouslySetInnerHTML={{
                      __html: c.prompt.replace(
                        /(https?:\/\/[^\s]+)/g,
                        '<a href="$1" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">$1</a>',
                      ),
                    }}
                  />
                  {team != null && (
                    <HStack>
                      <Button
                        colorScheme="blue"
                        size="md"
                        onClick={(e) => {
                          router.push(`/submit/${c.id}`);
                          e.stopPropagation();
                        }}
                        width="fit-content"
                      >
                        Submit Challenge
                      </Button>
                      <Button
                        size="md"
                        variant="outline"
                        colorScheme="pink"
                        leftIcon={
                          c.favorited ? <AiFillHeart /> : <AiOutlineHeart />
                        }
                        isLoading={favBusyId === c.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleFavorite(c.id);
                        }}
                      >
                        {c.favorited ? "Unfavorite" : "Favorite for team"}
                      </Button>
                    </HStack>
                  )}
                </VStack>
              )}
            </Flex>
          </Card>
        ))}
      </VStack>
    </NavContainer>
  );
}
