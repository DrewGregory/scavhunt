import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Heading,
  HStack,
  Progress,
  SimpleGrid,
  Text,
  useToast,
  VStack,
} from "@chakra-ui/react";
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from "next";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";
import NavContainer from "../components/NavContainer";
import { RegistrationSurveyModal } from "../components/RegistrationSurveyModal";
import { RoundCountdownBanner } from "../components/RoundCountdownBanner";
import { requireUserSSP, publicUser } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { ensureRoundClosedIfExpired } from "../lib/tournament";

type MatchupView = {
  id: string;
  round: number;
  isOpen: boolean;
  slotA: { id: string; name: string };
  slotB: { id: string; name: string };
  winnerId: string | null;
  votesA: number;
  votesB: number;
  myVoteNeighborhoodId: string | null;
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const user = auth.user!;
  const roundInfo = await ensureRoundClosedIfExpired();

  const openRound = await prisma.matchup.aggregate({
    where: { isOpen: true },
    _max: { round: true },
  });
  const round = openRound._max.round;

  let matchups: MatchupView[] = [];

  if (round != null) {
    const rows = await prisma.matchup.findMany({
      where: { round },
      include: {
        slotA: true,
        slotB: true,
        votes: { select: { userId: true, neighborhoodId: true } },
      },
      orderBy: { id: "asc" },
    });

    matchups = rows.map((m) => {
      const votesA = m.votes.filter((v) => v.neighborhoodId === m.slotAId)
        .length;
      const votesB = m.votes.filter((v) => v.neighborhoodId === m.slotBId)
        .length;
      const mine = m.votes.find((v) => v.userId === user.id);
      return {
        id: m.id,
        round: m.round,
        isOpen: m.isOpen,
        slotA: { id: m.slotA.id, name: m.slotA.name },
        slotB: { id: m.slotB.id, name: m.slotB.name },
        winnerId: m.winnerId,
        votesA,
        votesB,
        myVoteNeighborhoodId: mine?.neighborhoodId ?? null,
      };
    });
  } else {
    const latest = await prisma.matchup.aggregate({ _max: { round: true } });
    if (latest._max.round != null) {
      const rows = await prisma.matchup.findMany({
        where: { round: latest._max.round },
        include: {
          slotA: true,
          slotB: true,
          votes: { select: { userId: true, neighborhoodId: true } },
        },
        orderBy: { id: "asc" },
      });
      matchups = rows.map((m) => {
        const votesA = m.votes.filter((v) => v.neighborhoodId === m.slotAId)
          .length;
        const votesB = m.votes.filter((v) => v.neighborhoodId === m.slotBId)
          .length;
        const mine = m.votes.find((v) => v.userId === user.id);
        return {
          id: m.id,
          round: m.round,
          isOpen: m.isOpen,
          slotA: { id: m.slotA.id, name: m.slotA.name },
          slotB: { id: m.slotB.id, name: m.slotB.name },
          winnerId: m.winnerId,
          votesA,
          votesB,
          myVoteNeighborhoodId: mine?.neighborhoodId ?? null,
        };
      });
    }
  }

  const currentRound = matchups[0]?.round ?? roundInfo.currentRound;

  return {
    props: {
      user: publicUser(user),
      matchups,
      currentRound,
      currentRoundEndsAt: roundInfo.endsAt,
    },
  };
};

export default function TournamentPage({
  matchups: initial,
  currentRound,
  currentRoundEndsAt,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [matchups, setMatchups] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [surveyRequired, setSurveyRequired] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const openRoundForBanner = matchups.some((m) => m.isOpen)
    ? currentRound
    : null;

  const onExpired = useCallback(() => {
    router.replace(router.asPath);
  }, [router]);

  async function vote(matchupId: string, neighborhoodId: string) {
    setBusyId(matchupId);
    try {
      const res = await fetch("/api/tournament/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchupId, neighborhoodId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403 && data.code === "SURVEY_REQUIRED") {
          setSurveyRequired(true);
          setSurveyOpen(true);
          return;
        }
        toast({
          title: data.error || "Could not vote",
          status: "error",
        });
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
    <NavContainer title="Tournament">
      <VStack align="stretch" spacing={6}>
        <Box>
          <Heading size="lg">Neighborhood tournament</Heading>
          <Text color="gray.600" mt={1}>
            {currentRound == null
              ? "No bracket yet — ask an admin to seed neighborhoods."
              : `Round ${currentRound}. Vote once per matchup.`}
          </Text>
          <Box mt={3}>
            <RoundCountdownBanner
              round={openRoundForBanner}
              endsAtISO={openRoundForBanner != null ? currentRoundEndsAt : null}
              tone="light"
              onExpired={onExpired}
            />
          </Box>
        </Box>

        {matchups.length === 0 ? (
          <Text color="gray.500">Nothing to vote on yet.</Text>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            {matchups.map((m) => {
              const isBye = m.slotA.id === m.slotB.id;
              if (isBye) {
                return (
                  <Card key={m.id}>
                    <CardBody>
                      <HStack justify="space-between" mb={3}>
                        <Badge>Round {m.round}</Badge>
                        <Badge colorScheme="purple">Bye</Badge>
                      </HStack>
                      <Text fontWeight="medium">{m.slotA.name}</Text>
                      <Text fontSize="sm" color="gray.500" mt={1}>
                        Advances automatically
                      </Text>
                    </CardBody>
                  </Card>
                );
              }
              const total = m.votesA + m.votesB;
              const pctA =
                total === 0 ? 50 : Math.round((m.votesA / total) * 100);
              const voted = Boolean(m.myVoteNeighborhoodId);
              const showTallies = voted || !m.isOpen;
              return (
                <Card key={m.id}>
                  <CardBody>
                    <HStack justify="space-between" mb={3}>
                      <Badge>Round {m.round}</Badge>
                      <Badge colorScheme={m.isOpen ? "green" : "gray"}>
                        {m.isOpen ? "Open" : "Closed"}
                      </Badge>
                    </HStack>
                    <VStack spacing={3} align="stretch">
                      <MatchupSide
                        name={m.slotA.name}
                        votes={m.votesA}
                        pct={pctA}
                        selected={m.myVoteNeighborhoodId === m.slotA.id}
                        winner={m.winnerId === m.slotA.id}
                        showTallies={showTallies}
                        disabled={!m.isOpen || busyId === m.id}
                        onVote={() => vote(m.id, m.slotA.id)}
                      />
                      <Text textAlign="center" fontSize="sm" color="gray.500">
                        vs
                      </Text>
                      <MatchupSide
                        name={m.slotB.name}
                        votes={m.votesB}
                        pct={100 - pctA}
                        selected={m.myVoteNeighborhoodId === m.slotB.id}
                        winner={m.winnerId === m.slotB.id}
                        showTallies={showTallies}
                        disabled={!m.isOpen || busyId === m.id}
                        onVote={() => vote(m.id, m.slotB.id)}
                      />
                    </VStack>
                  </CardBody>
                </Card>
              );
            })}
          </SimpleGrid>
        )}
      </VStack>

      <RegistrationSurveyModal
        isOpen={surveyOpen}
        onClose={() => {
          setSurveyOpen(false);
          setSurveyRequired(false);
        }}
        required={surveyRequired}
      />
    </NavContainer>
  );
}

function MatchupSide({
  name,
  votes,
  pct,
  selected,
  winner,
  showTallies,
  disabled,
  onVote,
}: {
  name: string;
  votes: number;
  pct: number;
  selected: boolean;
  winner: boolean;
  showTallies: boolean;
  disabled: boolean;
  onVote: () => void;
}) {
  return (
    <Box>
      <Button
        w="100%"
        justifyContent="space-between"
        variant={selected ? "solid" : "outline"}
        colorScheme={winner ? "green" : selected ? "blue" : "gray"}
        onClick={onVote}
        isDisabled={disabled}
      >
        <Text>{name}</Text>
        {showTallies ? <Text fontSize="sm">{votes}</Text> : null}
      </Button>
      {showTallies ? (
        <Progress
          value={pct}
          size="xs"
          mt={2}
          colorScheme="blue"
          borderRadius="full"
        />
      ) : null}
    </Box>
  );
}
