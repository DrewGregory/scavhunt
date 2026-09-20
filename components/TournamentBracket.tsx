"use client";

import {
  Box,
  Flex,
  Text,
  Tooltip,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { useMemo, useState } from "react";
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
  const emoji = neighborhoodEmoji(neighborhood.name);

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
            winner ? "yellow.300" : selected ? "whiteAlpha.800" : "whiteAlpha.300"
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

function MatchupColumn({
  matchups,
  busyId,
  onVote,
}: {
  matchups: Array<BracketMatchup | null>;
  busyId: string | null;
  onVote: (matchupId: string, neighborhoodId: string) => void;
}) {
  return (
    <VStack spacing={{ base: 4, md: 6 }} justify="space-around" flex="1" py={2}>
      {matchups.map((m, idx) => {
        if (!m) {
          return (
            <VStack key={`empty-${idx}`} spacing={2}>
              <TeamNode slot={{ kind: "empty" }} disabled />
              <Text fontSize="xs" color="whiteAlpha.500">
                vs
              </Text>
              <TeamNode slot={{ kind: "empty" }} disabled />
            </VStack>
          );
        }

        const canVote = m.isOpen;
        const showVotes = Boolean(m.myVoteNeighborhoodId) || !m.isOpen;

        return (
          <VStack
            key={m.id}
            spacing={2}
            bg="whiteAlpha.100"
            backdropFilter="blur(6px)"
            borderRadius="xl"
            px={2}
            py={3}
            borderWidth="1px"
            borderColor="whiteAlpha.300"
          >
            <TeamNode
              slot={{
                kind: "team",
                neighborhood: m.slotA,
                votes: showVotes ? m.votesA : undefined,
                selected: m.myVoteNeighborhoodId === m.slotA.id,
                winner: m.winnerId === m.slotA.id,
              }}
              disabled={!canVote || busyId === m.id}
              onClick={() => {
                if (!canVote) return;
                onVote(m.id, m.slotA.id);
              }}
            />
            <Text fontSize="xs" color="whiteAlpha.700" fontWeight="bold">
              VS
            </Text>
            <TeamNode
              slot={{
                kind: "team",
                neighborhood: m.slotB,
                votes: showVotes ? m.votesB : undefined,
                selected: m.myVoteNeighborhoodId === m.slotB.id,
                winner: m.winnerId === m.slotB.id,
              }}
              disabled={!canVote || busyId === m.id}
              onClick={() => {
                if (!canVote) return;
                onVote(m.id, m.slotB.id);
              }}
            />
            {canVote && !m.myVoteNeighborhoodId ? (
              <Text fontSize="9px" color="yellow.200">
                tap to vote
              </Text>
            ) : null}
          </VStack>
        );
      })}
    </VStack>
  );
}

function pad<T>(arr: T[], len: number): Array<T | null> {
  const out: Array<T | null> = [...arr];
  while (out.length < len) out.push(null);
  return out;
}

/** Classic 16-team bracket. Click an emoji in an open matchup to vote. */
export function TournamentBracket({
  matchups: initial,
  loggedIn,
  onNeedAuth,
}: {
  matchups: BracketMatchup[];
  loggedIn: boolean;
  onNeedAuth: () => void;
}) {
  const [matchups, setMatchups] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  const byRound = useMemo(() => {
    const map = new Map<number, BracketMatchup[]>();
    for (const m of matchups) {
      const list = map.get(m.round) ?? [];
      list.push(m);
      map.set(m.round, list);
    }
    for (const [round, list] of map) {
      map.set(
        round,
        [...list].sort((a, b) => a.id.localeCompare(b.id)),
      );
    }
    return map;
  }, [matchups]);

  const r1 = byRound.get(1) ?? [];
  const leftR1 = pad(r1.slice(0, 4), 4);
  const rightR1 = pad(r1.slice(4, 8), 4);

  const r2 = byRound.get(2) ?? [];
  const leftR2 = pad(r2.slice(0, 2), 2);
  const rightR2 = pad(r2.slice(2, 4), 2);

  const r3 = byRound.get(3) ?? [];
  const leftR3 = pad(r3.slice(0, 1), 1);
  const rightR3 = pad(r3.slice(1, 2), 1);

  const final = byRound.get(4)?.[0] ?? null;

  const champion =
    final?.winnerId == null
      ? null
      : final.winnerId === final.slotA.id
        ? final.slotA
        : final.slotB;

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

  return (
    <Box w="100%" overflowX="auto" py={4}>
      <Flex
        minW={{ base: "720px", lg: "980px" }}
        align="stretch"
        justify="space-between"
        gap={{ base: 2, md: 3 }}
        px={2}
      >
        <MatchupColumn matchups={leftR1} busyId={busyId} onVote={vote} />
        <MatchupColumn matchups={leftR2} busyId={busyId} onVote={vote} />
        <MatchupColumn matchups={leftR3} busyId={busyId} onVote={vote} />

        <VStack justify="center" spacing={4} px={2} minW="90px">
          <Text
            fontSize="xs"
            letterSpacing="widest"
            textTransform="uppercase"
            color="yellow.200"
            fontWeight="bold"
          >
            Final
          </Text>
          {final ? (
            <VStack
              spacing={2}
              bg="whiteAlpha.200"
              borderRadius="xl"
              px={3}
              py={4}
              borderWidth="1px"
              borderColor="yellow.300"
            >
              <TeamNode
                slot={{
                  kind: "team",
                  neighborhood: final.slotA,
                  votes:
                    final.myVoteNeighborhoodId || !final.isOpen
                      ? final.votesA
                      : undefined,
                  selected: final.myVoteNeighborhoodId === final.slotA.id,
                  winner: final.winnerId === final.slotA.id,
                }}
                disabled={!final.isOpen || busyId === final.id}
                onClick={() => vote(final.id, final.slotA.id)}
              />
              <Text fontSize="xs" color="whiteAlpha.700" fontWeight="bold">
                VS
              </Text>
              <TeamNode
                slot={{
                  kind: "team",
                  neighborhood: final.slotB,
                  votes:
                    final.myVoteNeighborhoodId || !final.isOpen
                      ? final.votesB
                      : undefined,
                  selected: final.myVoteNeighborhoodId === final.slotB.id,
                  winner: final.winnerId === final.slotB.id,
                }}
                disabled={!final.isOpen || busyId === final.id}
                onClick={() => vote(final.id, final.slotB.id)}
              />
            </VStack>
          ) : (
            <TeamNode slot={{ kind: "empty" }} disabled />
          )}
          {champion ? (
            <VStack spacing={1}>
              <Text fontSize="xs" color="yellow.200">
                Champion
              </Text>
              <TeamNode
                slot={{ kind: "team", neighborhood: champion, winner: true }}
                disabled
              />
            </VStack>
          ) : null}
        </VStack>

        <MatchupColumn matchups={rightR3} busyId={busyId} onVote={vote} />
        <MatchupColumn matchups={rightR2} busyId={busyId} onVote={vote} />
        <MatchupColumn matchups={rightR1} busyId={busyId} onVote={vote} />
      </Flex>
    </Box>
  );
}
