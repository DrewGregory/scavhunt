import { GetServerSidePropsContext } from "next";
import NavContainer from "../components/NavContainer";
import {
  Box,
  Flex,
  Heading,
  IconButton,
  Link,
  StackDivider,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FaVideo } from "react-icons/fa";
import { useRouter } from "next/router";
import { requireUserSSP, requireHuntAccessSSP } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { getTeamScore } from "../lib/scoring";
import { formatPhoneDisplay } from "../lib/phone";
import { isTerritoryEnabled } from "../lib/territoryGate";

type Member = {
  id: string;
  name: string;
  phoneE164: string;
};

type CompletedChallenge = {
  id: string;
  title: string;
  emoji: string | null;
  pts: number;
  completedAt: string;
};

type TeamHq = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  score: number;
  earned: number;
  deposited: number;
  bonus: number;
  members: Member[];
  completed: CompletedChallenge[];
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const huntRedirect = await requireHuntAccessSSP(auth.user);
  if (huntRedirect) return { redirect: huntRedirect };

  const user = auth.user!;
  const territoryEnabled = await isTerritoryEnabled();

  if (!user.teamId) {
    return {
      props: {
        team: null as TeamHq | null,
        territoryEnabled,
      },
    };
  }

  const [teamRow, score] = await Promise.all([
    prisma.team.findFirst({
      where: { id: user.teamId, deletedAt: null },
      include: {
        users: {
          where: { deletedAt: null, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, phoneE164: true },
        },
        submissions: {
          where: { deletedAt: null, accepted: true },
          orderBy: { createdAt: "desc" },
          include: {
            challenge: {
              select: { id: true, title: true, emoji: true, pts: true },
            },
          },
        },
      },
    }),
    getTeamScore(user.teamId),
  ]);

  if (!teamRow) {
    return {
      props: {
        team: null as TeamHq | null,
        territoryEnabled,
      },
    };
  }

  const seen = new Set<string>();
  const completed: CompletedChallenge[] = [];
  for (const s of teamRow.submissions) {
    if (seen.has(s.challengeId)) continue;
    seen.add(s.challengeId);
    completed.push({
      id: s.challenge.id,
      title: s.challenge.title,
      emoji: s.challenge.emoji,
      pts: s.challenge.pts,
      completedAt: s.createdAt.toISOString(),
    });
  }

  const team: TeamHq = {
    id: teamRow.id,
    name: teamRow.name,
    emoji: teamRow.emoji,
    color: teamRow.color,
    score: score.score,
    earned: score.earned,
    deposited: score.deposited,
    bonus: score.bonus,
    members: teamRow.users.map((u) => ({
      id: u.id,
      name: u.name,
      phoneE164: u.phoneE164,
    })),
    completed,
  };

  return {
    props: { team, territoryEnabled },
  };
};

export default function MyTeamPage({
  team,
  territoryEnabled,
}: {
  team: TeamHq | null;
  territoryEnabled: boolean;
}) {
  const router = useRouter();

  if (!team) {
    return (
      <NavContainer title="My Team">
        <Text color="gray.500" mt={8} textAlign="center">
          You&apos;re not on a team yet.
        </Text>
      </NavContainer>
    );
  }

  const scavTokButton = (
    <IconButton
      aria-label="Team ScavTok"
      icon={<FaVideo />}
      variant="ghost"
      size="md"
      onClick={() =>
        void router.push({
          pathname: "/feed",
          query: { view: "tok", teamId: team.id },
        })
      }
    />
  );

  return (
    <NavContainer title="My Team" right={scavTokButton}>
      <VStack align="stretch" spacing={6} maxW="560px" mx="auto">
        <Box
          bg="white"
          borderRadius="lg"
          boxShadow="sm"
          p={4}
          borderLeftWidth="4px"
          borderLeftColor={team.color}
        >
          <Flex align="center" gap={3}>
            <Text fontSize="3xl" lineHeight={1}>
              {team.emoji}
            </Text>
            <Box minW={0} flex={1}>
              <Heading size="md" noOfLines={2}>
                {team.name}
              </Heading>
              <Text fontWeight="semibold" color="gray.700" mt={0.5}>
                {team.score} pts
              </Text>
              {(territoryEnabled || team.deposited > 0 || team.bonus !== 0) && (
                <Text fontSize="sm" color="gray.500">
                  {[
                    `earned ${team.earned}`,
                    team.deposited > 0 ? `spent ${team.deposited}` : null,
                    team.bonus !== 0
                      ? `bonus ${team.bonus > 0 ? "+" : ""}${team.bonus}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              )}
            </Box>
          </Flex>
        </Box>

        <Box bg="white" borderRadius="lg" boxShadow="sm" overflow="hidden">
          <Text
            px={4}
            pt={3}
            pb={2}
            fontSize="xs"
            fontWeight="bold"
            color="gray.500"
            textTransform="uppercase"
            letterSpacing="wide"
          >
            Members
          </Text>
          <VStack align="stretch" spacing={0} divider={<StackDivider borderColor="gray.100" />}>
            {team.members.map((m) => (
              <Flex
                key={m.id}
                px={4}
                py={3}
                justify="space-between"
                align="center"
                gap={3}
              >
                <Text fontWeight="medium" color="gray.800" noOfLines={1}>
                  {m.name}
                </Text>
                <Link
                  href={`tel:${m.phoneE164}`}
                  color="blue.600"
                  fontSize="sm"
                  whiteSpace="nowrap"
                  flexShrink={0}
                >
                  {formatPhoneDisplay(m.phoneE164)}
                </Link>
              </Flex>
            ))}
          </VStack>
        </Box>

        <Box bg="white" borderRadius="lg" boxShadow="sm" overflow="hidden">
          <Text
            px={4}
            pt={3}
            pb={2}
            fontSize="xs"
            fontWeight="bold"
            color="gray.500"
            textTransform="uppercase"
            letterSpacing="wide"
          >
            Completed ({team.completed.length})
          </Text>
          {team.completed.length === 0 ? (
            <Text px={4} pb={4} color="gray.400" fontSize="sm">
              None yet
            </Text>
          ) : (
            <VStack
              align="stretch"
              spacing={0}
              divider={<StackDivider borderColor="gray.100" />}
            >
              {team.completed.map((c) => (
                <Flex
                  key={c.id}
                  px={4}
                  py={3}
                  justify="space-between"
                  align="center"
                  gap={3}
                >
                  <Flex align="center" gap={2} minW={0} flex={1}>
                    {c.emoji && (
                      <Text flexShrink={0} lineHeight={1}>
                        {c.emoji}
                      </Text>
                    )}
                    <Text noOfLines={2} color="gray.800">
                      {c.title}
                    </Text>
                  </Flex>
                  <Text
                    fontWeight="semibold"
                    color="gray.600"
                    fontSize="sm"
                    whiteSpace="nowrap"
                    flexShrink={0}
                  >
                    {c.pts}
                  </Text>
                </Flex>
              ))}
            </VStack>
          )}
        </Box>
      </VStack>
    </NavContainer>
  );
}
