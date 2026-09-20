"use client";

import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Flex,
  SimpleGrid,
  Text,
  Tooltip,
  useBreakpointValue,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { neighborhoodEmoji } from "../lib/neighborhoodEmoji";

export type BracketNeighborhood = {
  id: string;
  name: string;
  emoji?: string | null;
};

export type BracketMatchup = {
  id: string;
  round: number;
  isOpen: boolean;
  slotA: BracketNeighborhood;
  slotB: BracketNeighborhood;
  winnerId: string | null;
  votesA: number;
  votesB: number;
  myVoteNeighborhoodId: string | null;
};

type ViewMode = "list" | "bracket";

function isBye(m: BracketMatchup) {
  return m.slotA.id === m.slotB.id;
}

function roundLabel(round: number, maxRound: number) {
  if (round === maxRound) return "Final";
  if (round === maxRound - 1 && maxRound > 2) return "Semifinals";
  return `Round ${round}`;
}

function findChampion(
  matchups: BracketMatchup[],
): BracketNeighborhood | null {
  const openReal = matchups.some((m) => m.isOpen && !isBye(m));
  if (openReal || matchups.length === 0) return null;
  const maxRound = Math.max(...matchups.map((m) => m.round));
  const finals = matchups.filter((m) => m.round === maxRound);
  const decided =
    finals.find((m) => m.winnerId && !isBye(m)) ??
    finals.find((m) => m.winnerId);
  if (!decided?.winnerId) return null;
  return decided.winnerId === decided.slotA.id
    ? decided.slotA
    : decided.slotB;
}

/* ---------- shared team chip (list view) ---------- */

function TeamChip({
  neighborhood,
  votes,
  selected,
  winner,
  disabled,
  onClick,
}: {
  neighborhood: BracketNeighborhood;
  votes?: number;
  selected?: boolean;
  winner?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const emoji = neighborhoodEmoji(neighborhood.name, neighborhood.emoji);
  return (
    <Flex
      as="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      align="center"
      gap={3}
      w="100%"
      px={3}
      py={2.5}
      borderRadius="lg"
      bg={
        winner ? "yellow.300" : selected ? "whiteAlpha.800" : "whiteAlpha.250"
      }
      color={winner || selected ? "gray.900" : "white"}
      borderWidth="2px"
      borderColor={
        winner ? "yellow.400" : selected ? "white" : "whiteAlpha.400"
      }
      cursor={disabled ? "default" : "pointer"}
      opacity={disabled && !winner && !selected ? 0.85 : 1}
      _hover={disabled ? undefined : { bg: "whiteAlpha.400" }}
      textAlign="left"
    >
      <Text fontSize="2xl" lineHeight="1" flexShrink={0}>
        {emoji}
      </Text>
      <Box flex="1" minW={0}>
        <Text fontWeight="semibold" fontSize="sm" noOfLines={2}>
          {neighborhood.name}
        </Text>
      </Box>
      {typeof votes === "number" ? (
        <Badge colorScheme={winner ? "yellow" : "blackAlpha"} fontSize="xs">
          {votes}
        </Badge>
      ) : null}
    </Flex>
  );
}

function ListMatchupCard({
  matchup,
  busy,
  onVote,
}: {
  matchup: BracketMatchup;
  busy: boolean;
  onVote: (matchupId: string, neighborhoodId: string) => void;
}) {
  if (isBye(matchup)) {
    return (
      <Box
        bg="whiteAlpha.100"
        borderRadius="xl"
        borderWidth="1px"
        borderColor="whiteAlpha.300"
        borderStyle="dashed"
        px={3}
        py={3}
      >
        <Text fontSize="xs" color="whiteAlpha.700" mb={2} fontWeight="bold">
          BYE
        </Text>
        <TeamChip neighborhood={matchup.slotA} winner disabled />
        <Text fontSize="xs" color="whiteAlpha.600" mt={2}>
          Advances automatically
        </Text>
      </Box>
    );
  }

  const canVote = matchup.isOpen;
  const showVotes =
    Boolean(matchup.myVoteNeighborhoodId) || !matchup.isOpen;

  return (
    <Box
      bg="whiteAlpha.100"
      backdropFilter="blur(6px)"
      borderRadius="xl"
      borderWidth="1px"
      borderColor={matchup.isOpen ? "yellow.300" : "whiteAlpha.300"}
      px={3}
      py={3}
    >
      <Flex justify="space-between" align="center" mb={2}>
        <Badge colorScheme={matchup.isOpen ? "green" : "gray"} fontSize="9px">
          {matchup.isOpen ? "Open" : "Closed"}
        </Badge>
        {canVote && !matchup.myVoteNeighborhoodId ? (
          <Text fontSize="9px" color="yellow.200" fontWeight="bold">
            tap to vote
          </Text>
        ) : null}
      </Flex>
      <VStack spacing={2} align="stretch">
        <TeamChip
          neighborhood={matchup.slotA}
          votes={showVotes ? matchup.votesA : undefined}
          selected={matchup.myVoteNeighborhoodId === matchup.slotA.id}
          winner={matchup.winnerId === matchup.slotA.id}
          disabled={!canVote || busy}
          onClick={() => {
            if (!canVote) return;
            onVote(matchup.id, matchup.slotA.id);
          }}
        />
        <Text
          fontSize="xs"
          color="whiteAlpha.600"
          textAlign="center"
          fontWeight="bold"
        >
          VS
        </Text>
        <TeamChip
          neighborhood={matchup.slotB}
          votes={showVotes ? matchup.votesB : undefined}
          selected={matchup.myVoteNeighborhoodId === matchup.slotB.id}
          winner={matchup.winnerId === matchup.slotB.id}
          disabled={!canVote || busy}
          onClick={() => {
            if (!canVote) return;
            onVote(matchup.id, matchup.slotB.id);
          }}
        />
      </VStack>
    </Box>
  );
}

/* ---------- classic emoji nodes (bracket view) ---------- */

type Slot =
  | {
      kind: "team";
      neighborhood: BracketNeighborhood;
      votes?: number;
      selected?: boolean;
      winner?: boolean;
    }
  | { kind: "empty" };

function TeamNode({
  slot,
  disabled,
  onClick,
}: {
  slot: Slot;
  disabled?: boolean;
  onClick?: () => void;
}) {
  if (slot.kind === "empty") {
    return (
      <Flex
        align="center"
        justify="center"
        w={{ base: "44px", md: "56px" }}
        h={{ base: "44px", md: "56px" }}
        borderRadius="full"
        bg="whiteAlpha.200"
        borderWidth="1px"
        borderColor="whiteAlpha.400"
        borderStyle="dashed"
        color="whiteAlpha.600"
        fontSize="lg"
      >
        ?
      </Flex>
    );
  }

  const { neighborhood, selected, winner, votes } = slot;
  const emoji = neighborhoodEmoji(neighborhood.name, neighborhood.emoji);

  return (
    <Tooltip
      label={neighborhood.name}
      placement="top"
      hasArrow
      bg="gray.900"
      color="white"
      openDelay={120}
    >
      <VStack spacing={1}>
        <Flex
          as="button"
          type="button"
          onClick={onClick}
          disabled={disabled}
          align="center"
          justify="center"
          direction="column"
          w={{ base: "52px", md: "64px" }}
          h={{ base: "52px", md: "64px" }}
          borderRadius="full"
          bg={
            winner
              ? "yellow.300"
              : selected
                ? "whiteAlpha.800"
                : "whiteAlpha.300"
          }
          color={winner || selected ? "gray.900" : "white"}
          borderWidth="2px"
          borderColor={
            winner ? "yellow.400" : selected ? "white" : "whiteAlpha.500"
          }
          boxShadow={selected || winner ? "lg" : "md"}
          cursor={disabled ? "default" : "pointer"}
          transition="transform 0.15s ease"
          _hover={disabled ? undefined : { transform: "scale(1.08)" }}
          position="relative"
        >
          <Text fontSize={{ base: "xl", md: "2xl" }} lineHeight="1">
            {emoji}
          </Text>
          {typeof votes === "number" ? (
            <Text
              position="absolute"
              bottom="2px"
              fontSize="9px"
              fontWeight="bold"
            >
              {votes}
            </Text>
          ) : null}
        </Flex>
        <Text
          fontSize="10px"
          color="whiteAlpha.900"
          maxW="72px"
          noOfLines={1}
          textAlign="center"
          fontWeight={selected || winner ? "semibold" : "normal"}
        >
          {neighborhood.name}
        </Text>
      </VStack>
    </Tooltip>
  );
}

function ClassicMatchup({
  matchup,
  busyId,
  onVote,
}: {
  matchup: BracketMatchup;
  busyId: string | null;
  onVote: (matchupId: string, neighborhoodId: string) => void;
}) {
  if (isBye(matchup)) {
    return (
      <VStack
        spacing={1}
        bg="whiteAlpha.100"
        borderRadius="xl"
        px={2}
        py={3}
        borderWidth="1px"
        borderColor="whiteAlpha.300"
        borderStyle="dashed"
      >
        <Text fontSize="9px" color="whiteAlpha.600" fontWeight="bold">
          BYE
        </Text>
        <TeamNode
          slot={{ kind: "team", neighborhood: matchup.slotA, winner: true }}
          disabled
        />
      </VStack>
    );
  }

  const canVote = matchup.isOpen;
  const showVotes =
    Boolean(matchup.myVoteNeighborhoodId) || !matchup.isOpen;

  return (
    <VStack
      spacing={2}
      bg="whiteAlpha.100"
      backdropFilter="blur(6px)"
      borderRadius="xl"
      px={2}
      py={3}
      borderWidth="1px"
      borderColor={matchup.isOpen ? "yellow.300" : "whiteAlpha.300"}
    >
      <TeamNode
        slot={{
          kind: "team",
          neighborhood: matchup.slotA,
          votes: showVotes ? matchup.votesA : undefined,
          selected: matchup.myVoteNeighborhoodId === matchup.slotA.id,
          winner: matchup.winnerId === matchup.slotA.id,
        }}
        disabled={!canVote || busyId === matchup.id}
        onClick={() => {
          if (!canVote) return;
          onVote(matchup.id, matchup.slotA.id);
        }}
      />
      <Text fontSize="xs" color="whiteAlpha.700" fontWeight="bold">
        VS
      </Text>
      <TeamNode
        slot={{
          kind: "team",
          neighborhood: matchup.slotB,
          votes: showVotes ? matchup.votesB : undefined,
          selected: matchup.myVoteNeighborhoodId === matchup.slotB.id,
          winner: matchup.winnerId === matchup.slotB.id,
        }}
        disabled={!canVote || busyId === matchup.id}
        onClick={() => {
          if (!canVote) return;
          onVote(matchup.id, matchup.slotB.id);
        }}
      />
      {canVote && !matchup.myVoteNeighborhoodId ? (
        <Text fontSize="9px" color="yellow.200">
          tap to vote
        </Text>
      ) : null}
    </VStack>
  );
}

function ListView({
  rounds,
  maxRound,
  openRound,
  champion,
  busyId,
  onVote,
}: {
  rounds: Array<{ round: number; matchups: BracketMatchup[] }>;
  maxRound: number;
  openRound: number | undefined;
  champion: BracketNeighborhood | null;
  busyId: string | null;
  onVote: (matchupId: string, neighborhoodId: string) => void;
}) {
  return (
    <VStack align="stretch" spacing={6} w="100%" py={2} px={1}>
      {champion ? (
        <Box
          textAlign="center"
          bg="blackAlpha.400"
          borderRadius="2xl"
          borderWidth="1px"
          borderColor="yellow.300"
          py={4}
          px={3}
        >
          <Text
            fontSize="xs"
            letterSpacing="widest"
            textTransform="uppercase"
            color="yellow.200"
            fontWeight="bold"
            mb={2}
          >
            Champion
          </Text>
          <Text fontSize="3xl" lineHeight="1" mb={1}>
            {neighborhoodEmoji(champion.name, champion.emoji)}
          </Text>
          <Text fontWeight="bold" fontSize="lg">
            {champion.name}
          </Text>
        </Box>
      ) : null}

      {rounds.map(({ round, matchups: roundMatchups }) => {
        const isCurrent = round === openRound;
        const realCount = roundMatchups.filter((m) => !isBye(m)).length;
        return (
          <Box key={round}>
            <Flex align="center" gap={2} mb={3} px={1} flexWrap="wrap">
              <Text
                fontSize="sm"
                fontWeight="bold"
                letterSpacing="wide"
                textTransform="uppercase"
                color={isCurrent ? "yellow.200" : "whiteAlpha.800"}
              >
                {roundLabel(round, maxRound)}
              </Text>
              {isCurrent ? (
                <Badge colorScheme="yellow" fontSize="9px">
                  Vote now
                </Badge>
              ) : null}
              <Text fontSize="xs" color="whiteAlpha.600">
                {realCount} matchup{realCount === 1 ? "" : "s"}
              </Text>
            </Flex>
            <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={3}>
              {roundMatchups.map((m) => (
                <ListMatchupCard
                  key={m.id}
                  matchup={m}
                  busy={busyId === m.id}
                  onVote={onVote}
                />
              ))}
            </SimpleGrid>
          </Box>
        );
      })}
    </VStack>
  );
}

/** Classic left→right round columns (scroll horizontally on mobile). */
function ClassicBracketView({
  rounds,
  maxRound,
  openRound,
  champion,
  busyId,
  onVote,
}: {
  rounds: Array<{ round: number; matchups: BracketMatchup[] }>;
  maxRound: number;
  openRound: number | undefined;
  champion: BracketNeighborhood | null;
  busyId: string | null;
  onVote: (matchupId: string, neighborhoodId: string) => void;
}) {
  return (
    <Box w="100%" overflowX="auto" py={3} px={1}>
      <Flex
        align="stretch"
        gap={{ base: 3, md: 4 }}
        minW="max-content"
        px={1}
      >
        {rounds.map(({ round, matchups: roundMatchups }) => {
          const isCurrent = round === openRound;
          return (
            <VStack
              key={round}
              spacing={3}
              align="center"
              minW={{ base: "110px", md: "130px" }}
            >
              <Text
                fontSize="xs"
                letterSpacing="widest"
                textTransform="uppercase"
                color={isCurrent ? "yellow.200" : "whiteAlpha.700"}
                fontWeight="bold"
                whiteSpace="nowrap"
              >
                {roundLabel(round, maxRound)}
              </Text>
              <VStack spacing={4} justify="space-around" flex="1" w="100%">
                {roundMatchups.map((m) => (
                  <ClassicMatchup
                    key={m.id}
                    matchup={m}
                    busyId={busyId}
                    onVote={onVote}
                  />
                ))}
              </VStack>
            </VStack>
          );
        })}

        {champion ? (
          <VStack spacing={3} justify="center" minW="100px" px={2}>
            <Text
              fontSize="xs"
              letterSpacing="widest"
              textTransform="uppercase"
              color="yellow.200"
              fontWeight="bold"
            >
              Champion
            </Text>
            <TeamNode
              slot={{ kind: "team", neighborhood: champion, winner: true }}
              disabled
            />
          </VStack>
        ) : null}
      </Flex>
    </Box>
  );
}

/**
 * Homepage tournament UI with two layouts:
 * - List: vertical cards (easy mobile scroll)
 * - Bracket: classic left→right columns (horizontal scroll OK)
 */
export function TournamentBracket({
  matchups: initial,
  loggedIn,
  onNeedAuth,
  onNeedSurvey,
}: {
  matchups: BracketMatchup[];
  loggedIn: boolean;
  onNeedAuth: () => void;
  onNeedSurvey?: () => void;
}) {
  const [matchups, setMatchups] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  const defaultView =
    useBreakpointValue<ViewMode>({ base: "list", md: "bracket" }) ?? "list";
  const [viewOverride, setViewOverride] = useState<ViewMode | null>(null);
  const view: ViewMode = viewOverride ?? defaultView;

  useEffect(() => {
    setMatchups(initial);
  }, [initial]);

  const rounds = useMemo(() => {
    const map = new Map<number, BracketMatchup[]>();
    for (const m of matchups) {
      const list = map.get(m.round) ?? [];
      list.push(m);
      map.set(m.round, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([round, list]) => ({
        round,
        matchups: [...list].sort((a, b) => a.id.localeCompare(b.id)),
      }));
  }, [matchups]);

  const maxRound = rounds.length > 0 ? rounds[rounds.length - 1].round : 1;
  const champion = findChampion(matchups);
  const openRound = rounds.find((r) =>
    r.matchups.some((m) => m.isOpen && !isBye(m)),
  )?.round;

  async function vote(matchupId: string, neighborhoodId: string) {
    if (!loggedIn) {
      onNeedAuth();
      return;
    }
    setBusyId(matchupId);
    try {
      const res = await fetch("/api/tournament/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchupId, neighborhoodId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        onNeedAuth();
        return;
      }
      if (res.status === 403 && data.code === "SURVEY_REQUIRED") {
        onNeedSurvey?.();
        return;
      }
      if (!res.ok) {
        toast({ title: data.error || "Could not vote", status: "error" });
        return;
      }
      setMatchups((prev) =>
        prev.map((m) => {
          if (m.id !== matchupId) return m;
          const next = { ...m, myVoteNeighborhoodId: neighborhoodId };
          if (m.myVoteNeighborhoodId === m.slotA.id) next.votesA -= 1;
          if (m.myVoteNeighborhoodId === m.slotB.id) next.votesB -= 1;
          if (neighborhoodId === m.slotA.id) next.votesA += 1;
          if (neighborhoodId === m.slotB.id) next.votesB += 1;
          return next;
        }),
      );
    } finally {
      setBusyId(null);
    }
  }

  if (matchups.length === 0) {
    return (
      <Text textAlign="center" color="whiteAlpha.700" py={6}>
        Bracket not seeded yet
      </Text>
    );
  }

  return (
    <Box w="100%">
      <Flex justify="center" mb={3}>
        <ButtonGroup size="sm" isAttached variant="outline">
          <Button
            onClick={() => setViewOverride("list")}
            bg={view === "list" ? "whiteAlpha.300" : "transparent"}
            color="white"
            borderColor="whiteAlpha.400"
            _hover={{ bg: "whiteAlpha.200" }}
          >
            List
          </Button>
          <Button
            onClick={() => setViewOverride("bracket")}
            bg={view === "bracket" ? "whiteAlpha.300" : "transparent"}
            color="white"
            borderColor="whiteAlpha.400"
            _hover={{ bg: "whiteAlpha.200" }}
          >
            Bracket
          </Button>
        </ButtonGroup>
      </Flex>

      {view === "list" ? (
        <ListView
          rounds={rounds}
          maxRound={maxRound}
          openRound={openRound}
          champion={champion}
          busyId={busyId}
          onVote={vote}
        />
      ) : (
        <ClassicBracketView
          rounds={rounds}
          maxRound={maxRound}
          openRound={openRound}
          champion={champion}
          busyId={busyId}
          onVote={vote}
        />
      )}
    </Box>
  );
}
