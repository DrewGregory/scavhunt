import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from "next";
import Image from "next/image";
import Link from "next/link";
import { formatISO, parseISO } from "date-fns";
import { useState } from "react";
import { getUserFromReq, publicUser } from "../lib/auth";
import { getStartTime } from "../lib/time";
import { prisma } from "../lib/prisma";
import sfBg from "../public/sf_bg.webp";
import { AuthModal } from "../components/AuthModal";
import {
  TournamentBracket,
  type BracketMatchup,
} from "../components/TournamentBracket";
import CountdownInline from "../components/CountdownInline";

function serializeBracket(
  rows: Array<{
    id: string;
    round: number;
    isOpen: boolean;
    slotAId: string;
    slotBId: string;
    winnerId: string | null;
    slotA: { id: string; name: string };
    slotB: { id: string; name: string };
    votes: Array<{ userId: string; neighborhoodId: string }>;
  }>,
  userId: string | null,
): BracketMatchup[] {
  return rows.map((m) => {
    const votesA = m.votes.filter((v) => v.neighborhoodId === m.slotAId).length;
    const votesB = m.votes.filter((v) => v.neighborhoodId === m.slotBId).length;
    const mine = userId
      ? m.votes.find((v) => v.userId === userId)?.neighborhoodId ?? null
      : null;
    return {
      id: m.id,
      round: m.round,
      isOpen: m.isOpen,
      slotA: { id: m.slotA.id, name: m.slotA.name },
      slotB: { id: m.slotB.id, name: m.slotB.name },
      winnerId: m.winnerId,
      votesA,
      votesB,
      myVoteNeighborhoodId: mine,
    };
  });
}

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const user = await getUserFromReq(context.req);
  const startTime = getStartTime();
  const scavengerHuntName =
    process.env.SCAVENGER_HUNT_NAME || "Scavenger Hunt";
  const huntStarted = Date.now() >= startTime.getTime();

  const rows = await prisma.matchup.findMany({
    include: {
      slotA: true,
      slotB: true,
      votes: { select: { userId: true, neighborhoodId: true } },
    },
    orderBy: [{ round: "asc" }, { id: "asc" }],
  });

  return {
    props: {
      user: user ? publicUser(user) : null,
      startTimeISO: formatISO(startTime),
      scavengerHuntName,
      huntStarted,
      matchups: serializeBracket(rows, user?.id ?? null),
    },
  };
};

export default function HomePage({
  user,
  startTimeISO,
  scavengerHuntName,
  huntStarted,
  matchups,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");

  function openAuth(mode: "login" | "signup") {
    setAuthMode(mode);
    setAuthOpen(true);
  }

  // Pre-hunt (or "app closed"): splash + full visual bracket
  if (!huntStarted) {
    return (
      <Box position="relative" minH="100vh" color="white">
        <Box position="fixed" inset={0} zIndex={0}>
          <Image
            src={sfBg}
            alt="San Francisco background"
            fill
            sizes="100vw"
            style={{ objectFit: "cover", objectPosition: "center" }}
            placeholder="blur"
            priority
          />
          <Box position="absolute" inset={0} bg="blackAlpha.500" />
        </Box>

        <Box position="relative" zIndex={1}>
          <Container maxW="container.xl" pt={{ base: 6, md: 8 }} pb={4}>
            <HStack justify="space-between" align="flex-start" flexWrap="wrap" gap={3}>
              <VStack align="flex-start" spacing={1}>
                <Heading
                  size={{ base: "lg", md: "xl" }}
                  letterSpacing="tight"
                >
                  {scavengerHuntName}
                </Heading>
                <Text color="whiteAlpha.800" fontSize="sm">
                  Neighborhood tournament · vote before the hunt begins
                </Text>
              </VStack>

              <HStack spacing={3}>
                {user ? (
                  <>
                    <Text fontSize="sm" color="whiteAlpha.900">
                      {user.name}
                      {user.isAdmin ? " · admin" : ""}
                    </Text>
                    {user.isAdmin ? (
                      <Button as={Link} href="/admin" size="sm" colorScheme="yellow">
                        Admin
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="solid"
                      colorScheme="blackAlpha"
                      onClick={() => openAuth("login")}
                    >
                      Log in
                    </Button>
                    <Button
                      size="sm"
                      colorScheme="yellow"
                      onClick={() => openAuth("signup")}
                    >
                      Sign up
                    </Button>
                  </>
                )}
              </HStack>
            </HStack>

            <Box
              mt={6}
              mx="auto"
              maxW="md"
              bg="whiteAlpha.200"
              backdropFilter="blur(10px)"
              borderRadius="2xl"
              px={6}
              py={5}
              textAlign="center"
              boxShadow="xl"
            >
              <Text
                fontSize="xs"
                letterSpacing="widest"
                textTransform="uppercase"
                mb={2}
                color="whiteAlpha.800"
              >
                Hunt starts in
              </Text>
              <CountdownInline startTime={parseISO(startTimeISO)} />
            </Box>
          </Container>

          <Container maxW="container.xl" pb={10}>
            <Box
              bg="whiteAlpha.100"
              backdropFilter="blur(8px)"
              borderRadius="2xl"
              borderWidth="1px"
              borderColor="whiteAlpha.300"
              px={{ base: 2, md: 4 }}
              py={4}
              boxShadow="xl"
            >
              <Text
                textAlign="center"
                fontSize="sm"
                color="whiteAlpha.800"
                mb={2}
              >
                Hover an emoji for the neighborhood name
                {user ? " · tap to cast your vote" : " · sign up to vote"}
              </Text>
              <TournamentBracket
                matchups={matchups}
                loggedIn={Boolean(user)}
                onNeedAuth={() => openAuth("signup")}
              />
            </Box>
          </Container>
        </Box>

        <AuthModal
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          initialMode={authMode}
        />
      </Box>
    );
  }

  // Hunt has started
  return (
    <Box position="relative" minH="100vh" overflow="hidden">
      <Box position="fixed" inset={0} zIndex={0}>
        <Image
          src={sfBg}
          alt="San Francisco background"
          fill
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "center" }}
          placeholder="blur"
          priority
        />
      </Box>

      <Container
        maxW="container.md"
        position="relative"
        zIndex={1}
        minH="100vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        py={12}
      >
        <Box
          bg="whiteAlpha.200"
          backdropFilter="blur(10px)"
          borderRadius="2xl"
          px={{ base: 6, md: 10 }}
          py={{ base: 8, md: 10 }}
          boxShadow="xl"
          color="white"
          textAlign="center"
          w="100%"
        >
          <VStack spacing={5}>
            <Heading size="xl">{scavengerHuntName}</Heading>
            <Text fontSize="lg" opacity={0.95}>
              {user
                ? `Hey ${user.name} — the hunt is on.`
                : "The scavenger hunt has started."}
            </Text>
            <HStack spacing={4} flexWrap="wrap" justify="center" pt={2}>
              {user ? (
                <>
                  <Button as={Link} href="/feed" colorScheme="yellow" size="lg">
                    Open feed
                  </Button>
                  <Button
                    as={Link}
                    href="/challenges"
                    variant="outline"
                    size="lg"
                    color="white"
                    borderColor="whiteAlpha.700"
                  >
                    Challenges
                  </Button>
                </>
              ) : (
                <>
                  <Button colorScheme="yellow" size="lg" onClick={() => openAuth("login")}>
                    Log in
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    color="white"
                    borderColor="whiteAlpha.700"
                    onClick={() => openAuth("signup")}
                  >
                    Sign up
                  </Button>
                </>
              )}
            </HStack>
          </VStack>
        </Box>
      </Container>

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        initialMode={authMode}
      />
    </Box>
  );
}
