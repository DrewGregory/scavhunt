"use client";

import {
  Badge,
  Box,
  Flex,
  SimpleGrid,
  Text,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { neighborhoodEmoji } from "../lib/neighborhoodEmoji";

export type BracketNeighborhood = {
  id: string;
  name: string;
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

function isBye(m: BracketMatchup) {
  return m.slotA.id === m.slotB.id;
}

function roundLabel(round: number, maxRound: number) {
  if (round === maxRound) return "Final";
  if (round === maxRound - 1 && maxRound > 2) return "Semifinals";
  return `Round ${round}`;
}

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
  const emoji = neighborhoodEmoji(neighborhood.name);
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

function MatchupCard({
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

/**
 * Vertical, mobile-first bracket — natural vertical scroll, any N teams.
 * Rounds stack top→bottom; matchups wrap in a responsive grid.
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
            {neighborhoodEmoji(champion.name)}
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
                <MatchupCard
                  key={m.id}
                  matchup={m}
                  busy={busyId === m.id}
                  onVote={vote}
                />
              ))}
            </SimpleGrid>
          </Box>
        );
      })}
    </VStack>
  );
}
