import { GetServerSidePropsContext } from "next";
import NavContainer from "../components/NavContainer";
import {
  Box,
  Button,
  Collapse,
  Flex,
  Heading,
  HStack,
  IconButton,
  Image,
  Input,
  Link,
  StackDivider,
  Text,
  useToast,
  VStack,
  chakra,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { FaVideo } from "react-icons/fa";
import { useRouter } from "next/router";
import { Fragment, useState } from "react";
import { requireUserSSP, requireHuntAccessSSP } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { getTeamScore } from "../lib/scoring";
import { formatPhoneDisplay } from "../lib/phone";
import { isTerritoryEnabled } from "../lib/territoryGate";
import { isImageUrl, isVideoUrl } from "../lib/feedTypes";
import EmojiInput from "../components/EmojiInput";

type Member = {
  id: string;
  name: string;
  phoneE164: string;
};

type TeamSubmission = {
  id: string;
  note: string;
  mediaURL: string | null;
  posterURL: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
};

type CompletedChallenge = {
  id: string;
  title: string;
  emoji: string | null;
  pts: number;
  completedAt: string;
  submissions: TeamSubmission[];
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
          select: {
            id: true,
            challengeId: true,
            note: true,
            mediaURL: true,
            posterURL: true,
            durationSec: true,
            width: true,
            height: true,
            createdAt: true,
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

  const byChallenge = new Map<string, CompletedChallenge>();
  for (const s of teamRow.submissions) {
    const existing = byChallenge.get(s.challengeId);
    const sub: TeamSubmission = {
      id: s.id,
      note: s.note,
      mediaURL: s.mediaURL,
      posterURL: s.posterURL,
      durationSec: s.durationSec,
      width: s.width,
      height: s.height,
      createdAt: s.createdAt.toISOString(),
    };
    if (existing) {
      existing.submissions.push(sub);
      continue;
    }
    byChallenge.set(s.challengeId, {
      id: s.challenge.id,
      title: s.challenge.title,
      emoji: s.challenge.emoji,
      pts: s.challenge.pts,
      completedAt: s.createdAt.toISOString(),
      submissions: [sub],
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
    completed: [...byChallenge.values()],
  };

  return {
    props: { team, territoryEnabled },
  };
};

export default function MyTeamPage({
  team: initialTeam,
  territoryEnabled,
}: {
  team: TeamHq | null;
  territoryEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [team, setTeam] = useState(initialTeam);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(initialTeam?.name ?? "");
  const [draftEmoji, setDraftEmoji] = useState(initialTeam?.emoji ?? "");
  const [saving, setSaving] = useState(false);

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

  const startEdit = () => {
    setDraftName(team.name);
    setDraftEmoji(team.emoji);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftName(team.name);
    setDraftEmoji(team.emoji);
  };

  const saveTeam = async () => {
    const name = draftName.trim();
    if (!name) {
      toast({ title: "Team name is required", status: "error" });
      return;
    }
    if (!draftEmoji.trim()) {
      toast({ title: "Pick a team emoji", status: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/me/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, emoji: draftEmoji }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: data.error || "Couldn't update team",
          status: "error",
        });
        return;
      }
      setTeam((prev) =>
        prev
          ? { ...prev, name: data.team.name, emoji: data.team.emoji }
          : prev,
      );
      setEditing(false);
      toast({ title: "Team updated", status: "success", duration: 2000 });
    } catch {
      toast({ title: "Couldn't update team", status: "error" });
    } finally {
      setSaving(false);
    }
  };

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
          {editing ? (
            <VStack align="stretch" spacing={3}>
              <HStack spacing={3} align="center">
                <EmojiInput
                  value={draftEmoji}
                  onChange={setDraftEmoji}
                  size="md"
                />
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Team name"
                  fontWeight="semibold"
                />
              </HStack>
              <HStack justify="flex-end" spacing={2}>
                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  colorScheme="blue"
                  onClick={() => void saveTeam()}
                  isLoading={saving}
                >
                  Save
                </Button>
              </HStack>
            </VStack>
          ) : (
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
                {(territoryEnabled ||
                  team.deposited > 0 ||
                  team.bonus !== 0) && (
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
              <Button size="sm" variant="outline" onClick={startEdit}>
                Edit
              </Button>
            </Flex>
          )}
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
          <VStack
            align="stretch"
            spacing={0}
            divider={<StackDivider borderColor="gray.100" />}
          >
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
              {team.completed.map((c) => {
                const open = expandedId === c.id;
                return (
                  <Fragment key={c.id}>
                    <Flex
                      px={4}
                      py={3}
                      justify="space-between"
                      align="center"
                      gap={3}
                      cursor="pointer"
                      _hover={{ bg: "gray.50" }}
                      bg={open ? "gray.50" : undefined}
                      onClick={() =>
                        setExpandedId((prev) => (prev === c.id ? null : c.id))
                      }
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
                      <HStack spacing={2} flexShrink={0}>
                        <Text
                          fontWeight="semibold"
                          color="gray.600"
                          fontSize="sm"
                          whiteSpace="nowrap"
                        >
                          {c.pts}
                        </Text>
                        <ChevronDownIcon
                          w={4}
                          h={4}
                          color="gray.400"
                          transform={open ? "rotate(180deg)" : undefined}
                          transition="transform 0.15s ease"
                        />
                      </HStack>
                    </Flex>
                    <Collapse in={open} animateOpacity>
                      <Box px={4} pb={3} bg="gray.50">
                        <VStack align="stretch" spacing={3}>
                          {c.submissions.map((s) => (
                            <SubmissionPreview key={s.id} submission={s} />
                          ))}
                        </VStack>
                      </Box>
                    </Collapse>
                  </Fragment>
                );
              })}
            </VStack>
          )}
        </Box>
      </VStack>
    </NavContainer>
  );
}

function SubmissionPreview({ submission: s }: { submission: TeamSubmission }) {
  const isVideo = isVideoUrl(s.mediaURL);
  const isImage = !isVideo && isImageUrl(s.mediaURL);
  const aspect =
    s.width && s.height ? `${s.width} / ${s.height}` : "16 / 9";

  return (
    <VStack align="stretch" spacing={2}>
      {s.note.trim() && (
        <Text fontSize="sm" color="gray.700" fontWeight="medium">
          {s.note}
        </Text>
      )}
      {(isVideo || isImage) && s.mediaURL ? (
        <Box
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
              controls
              playsInline
              poster={s.posterURL ?? undefined}
              src={s.mediaURL}
              width="100%"
              maxHeight="360px"
              objectFit="contain"
              sx={{ aspectRatio: aspect }}
            />
          )}
          {isImage && (
            <Image
              src={s.mediaURL}
              alt={s.note || "Submission"}
              width="100%"
              maxHeight="360px"
              objectFit="contain"
            />
          )}
        </Box>
      ) : (
        <Box
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="md"
          bg="white"
          px={3}
          py={2}
        >
          <Text fontSize="sm" color="gray.500">
            No media uploaded
          </Text>
        </Box>
      )}
    </VStack>
  );
}
