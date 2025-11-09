import NavContainer from "../components/NavContainer";
import { serializedTeamSchema } from "../models/Team";
import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import { dbConnect } from "../lib/dbConnect";
import {
  serializedSubmissionSchema,
  SubmissionModel
} from "../models/Submission";
import {
  Button,
  Card,
  Flex,
  Heading,
  HStack,
  Input,
  Link,
  Switch,
  Tag,
  Text,
  VStack,
  Image,
  Box,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { HiDotsVertical } from "react-icons/hi";
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai";
import { z } from "zod";
import { serializedChallengeSchema } from "../models/Challenge";
import { isAdminTeam, getTeamFromCookie } from "../lib/team";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDistance, formatISO, parseISO,  } from "date-fns";
import { useRouter } from "next/router";
import { getStartTime } from "../lib/time";

const submissionWithLookupsSchema = serializedSubmissionSchema.merge(
  z.object({
    team: serializedTeamSchema,
    challenge: serializedChallengeSchema
  })
);

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  await dbConnect();
  const teamRaw = await getTeamFromCookie(context.req.cookies);


  const startTime = getStartTime();
  const scavengerHuntName = process.env.SCAVENGER_HUNT_NAME || "Scavenger Hunt";
  const showHowToPlay = process.env.SHOW_HOW_TO_PLAY === 'true';

  if (teamRaw == null) {
    return {
      props: {
        team: null,
        submissions: [],
        startTimeISO: formatISO(startTime),
        scavengerHuntName,
        showHowToPlay,
        isAdmin: false,
      }
    };
  }

  const submissionsRaw = await SubmissionModel.aggregate([
    {
      $sort: {
        createdAt: -1
      }
    },
    {
      $lookup: {
        from: "teams",
        localField: "teamId",
        foreignField: "_id",
        as: "team"
      }
    },
    {
      $lookup: {
        from: "challenges",
        localField: "challengeId",
        foreignField: "_id",
        as: "challenge"
      }
    },
    {
      $unwind: {
        path: "$challenge",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $unwind: {
        path: "$team",
        preserveNullAndEmptyArrays: true
      }
    }
  ]);
  const submissions = z
    .array(submissionWithLookupsSchema)
    .parse(submissionsRaw);

  const team = serializedTeamSchema.parse(teamRaw);
  const isAdmin = isAdminTeam(teamRaw._id.toString());

  return {
    props: {
      team,
      submissions,
      startTimeISO: formatISO(startTime),
      scavengerHuntName,
      showHowToPlay,
      isAdmin,
    }
  };
};

const CountdownPage = dynamic(() => import("../components/CountdownPage"), {
  ssr: false
});

export default function Page({
  team,
  submissions,
  startTimeISO,
  scavengerHuntName,
  showHowToPlay,
  isAdmin,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionSearchParam = searchParams.get("submission");
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(
    submissionSearchParam
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [userFavorites, setUserFavorites] = useState<Set<string>>(new Set());
  const [favoriteCounts, setFavoriteCounts] = useState<Record<string, number>>({});
  const [sortByFavorites, setSortByFavorites] = useState<boolean>(false);
  const [showOnlyMyFavorites, setShowOnlyMyFavorites] = useState<boolean>(false);
  const [userId, setUserId] = useState<string>('');

  const ref = useRef<HTMLDivElement>(null);

  // Generate or load userId from localStorage on mount
  useEffect(() => {
    let storedUserId = localStorage.getItem('scavhunt-userId');
    if (!storedUserId) {
      // Generate a unique user ID
      storedUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('scavhunt-userId', storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  // Fetch favorites from server when userId is available
  useEffect(() => {
    if (!userId) return;

    const fetchFavorites = async () => {
      try {
        const response = await fetch(`/api/favorites?userId=${userId}`);
        const data = await response.json();
        setUserFavorites(new Set(data.userFavorites));
        setFavoriteCounts(data.counts);
      } catch (error) {
        console.error('Failed to fetch favorites', error);
      }
    };

    fetchFavorites();
  }, [userId]);

  const toggleFavorite = async (submissionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!userId) return;

    try {
      const response = await fetch('/api/toggle-favorite', {
        method: 'POST',
        body: JSON.stringify({ submissionId, userId }),
      });
      const data = await response.json();

      // Update local state
      setUserFavorites(prev => {
        const newSet = new Set(prev);
        if (data.favorited) {
          newSet.add(submissionId);
        } else {
          newSet.delete(submissionId);
        }
        return newSet;
      });

      // Update counts
      setFavoriteCounts(prev => ({
        ...prev,
        [submissionId]: (prev[submissionId] || 0) + (data.favorited ? 1 : -1),
      }));
    } catch (error) {
      console.error('Failed to toggle favorite', error);
    }
  };

  useEffect(() => {
    const current = ref.current;
    if (current != null) {
      current.scrollIntoView();
    }
  }, [ref.current, submissionSearchParam]);

  // Filter submissions based on search query (case-insensitive)
  const searchFilteredSubmissions = searchQuery.trim() === '' 
    ? submissions 
    : submissions.filter(s => 
        s.team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.challenge.title.toLowerCase().includes(searchQuery.toLowerCase())
      );

  // Filter by user's favorites if enabled
  const favoritesFilteredSubmissions = showOnlyMyFavorites
    ? searchFilteredSubmissions.filter(s => userFavorites.has(s._id))
    : searchFilteredSubmissions;

  // Sort submissions by global favorite count if enabled
  const filteredSubmissions = sortByFavorites
    ? [...favoritesFilteredSubmissions].sort((a, b) => {
        const aCount = favoriteCounts[a._id] || 0;
        const bCount = favoriteCounts[b._id] || 0;
        return bCount - aCount; // Most favorited first
      })
    : favoritesFilteredSubmissions;

  // Helper function to get submission number for a challenge (chronologically)
  const getSubmissionNumber = (submission: typeof submissions[0]) => {
    const challengeSubmissions = submissions
      .filter(s => s.challengeId === submission.challengeId && !s.rejected)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    const index = challengeSubmissions.findIndex(s => s._id === submission._id);
    return index >= 0 ? index + 1 : null;
  };

  // Helper function to get counts for a challenge
  const getChallengeStats = (submission: typeof submissions[0]) => {
    const allSubmissions = submissions.filter(s => s.challengeId === submission.challengeId);
    const acceptedCount = allSubmissions.filter(s => s.accepted).length;
    const pendingCount = allSubmissions.filter(s => !s.accepted && !s.rejected).length;
    return { acceptedCount, pendingCount };
  };

  return team != null ? (
    <NavContainer title="Home">
      {submissions.length === 0 ? (
        <Heading size="lg" color="gray.500" textAlign="center" mt={8}>
          No Submissions Yet!
        </Heading>
      ) : (
        <VStack justifyContent="flex-start" width="100%" spacing={4}>
          <Input
            placeholder="Search by team name or challenge name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            width="100%"
            bg="white"
            borderRadius="md"
            boxShadow="sm"
            size="md"
          />
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
                Sort by favorites
              </Text>
              <Switch
                isChecked={sortByFavorites}
                onChange={(e) => setSortByFavorites(e.target.checked)}
                colorScheme="red"
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
                Show only my favorites
              </Text>
              <Switch
                isChecked={showOnlyMyFavorites}
                onChange={(e) => setShowOnlyMyFavorites(e.target.checked)}
                colorScheme="red"
              />
            </HStack>
          </VStack>
          {filteredSubmissions.length === 0 ? (
            <Heading size="md" color="gray.500" textAlign="center" mt={8}>
              No submissions match your search.
            </Heading>
          ) : null}
          {filteredSubmissions.map((s) => (
            <Card
              ref={s._id === submissionSearchParam ? ref : null}
              key={s._id}
              width="100%"
              className={s._id === selectedSubmission ? "card open" : "card"}
              boxShadow="sm"
              _hover={{ boxShadow: "md" }}
              transition="all 0.2s"
              borderRadius="lg"
            >
              <Flex
                direction="row"
                justifyContent="space-between"
                alignItems="flex-start"
                p={4}
                gap={3}
              >
                <Flex
                  flex={1}
                  direction="column"
                  gap={2}
                  cursor="pointer"
                  onClick={() => {
                    setSelectedSubmission(
                      s._id === selectedSubmission ? null : s._id
                    );
                    router.push({
                      pathname: "/",
                      query: {
                        submission: s._id,
                      }
                    },undefined, {shallow: true} )
                  }}
                >
                  <Flex alignItems="center" gap={2} flexWrap="wrap">
                    <Text fontSize="lg" fontWeight="semibold" color="gray.800">
                      {s.challenge.title}
                    </Text>
                    <Tag 
                      size="sm" 
                      colorScheme={s.accepted ? "green" : (s.rejected ? "red" : "orange")}
                      fontWeight="medium"
                    >
                      {s.accepted ? "Accepted" : (s.rejected ? "Rejected" : "Pending")}
                    </Tag>
                  </Flex>
                  <Text fontSize="sm" color="gray.600" suppressHydrationWarning>
                    {formatDistance(new Date(s.createdAt), new Date())} ago by{" "}
                    <Link 
                      href={`/teams?team=${s.teamId}`}
                      fontWeight="medium"
                      color="gray.700"
                      _hover={{ color: "gray.900", textDecoration: "underline" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.team.emoji} {s.team.name}
                    </Link>
                  </Text>
                  {!s.rejected && getSubmissionNumber(s) && (() => {
                    const { acceptedCount, pendingCount } = getChallengeStats(s);
                    const submissionNum = getSubmissionNumber(s);
                    
                    if (s.accepted) {
                      return (
                        <Text fontSize="xs" color="gray.500" fontWeight="medium">
                          Submission #{submissionNum} of {s.challenge.numWinners} spot{s.challenge.numWinners === 1 ? "" : "s"}
                        </Text>
                      );
                    } else {
                      // For pending submissions
                      return (
                        <Text fontSize="xs" color="gray.500" fontWeight="medium">
                          Submission #{submissionNum} ({acceptedCount} accepted, {pendingCount} pending / {s.challenge.numWinners} spot{s.challenge.numWinners === 1 ? "" : "s"})
                        </Text>
                      );
                    }
                  })()}
                </Flex>

                <Flex alignItems="center" gap={1} flexShrink={0}>
                  <Flex
                    alignItems="center"
                    justifyContent="center"
                    bg="blue.50"
                    borderRadius="md"
                    px={3}
                    py={1}
                    minWidth="fit-content"
                  >
                    <Text fontSize="md" fontWeight="bold" color="blue.700">
                      {s.challenge.pts} pts
                    </Text>
                  </Flex>
                  <Flex alignItems="center" gap={0}>
                    <IconButton
                      aria-label="Toggle favorite"
                      icon={userFavorites.has(s._id) ? <AiFillHeart /> : <AiOutlineHeart />}
                      onClick={(e) => toggleFavorite(s._id, e)}
                      variant="ghost"
                      color={userFavorites.has(s._id) ? "red.500" : "gray.400"}
                      _hover={{ 
                        color: userFavorites.has(s._id) ? "red.600" : "gray.500",
                        bg: "transparent"
                      }}
                      size="md"
                      fontSize="xl"
                    />
                    <Text fontSize="sm" fontWeight="semibold" color="gray.600" minW="15px">
                      {favoriteCounts[s._id] || 0}
                    </Text>
                  </Flex>
                  {(isAdmin || team._id === s.teamId) && (
                    <Box visibility={s._id === selectedSubmission ? "visible" : "hidden"} width="32px">
                      <Menu>
                      <MenuButton
                        as={IconButton}
                        icon={<HiDotsVertical />}
                        variant="ghost"
                        size="sm"
                        aria-label="Options"
                        onClick={(e) => e.stopPropagation()}
                        _hover={{ bg: "gray.100" }}
                      />
                      <MenuList>
                        {isAdmin && (
                          <>
                            {!s.accepted && (
                              <MenuItem
                                onClick={async () => {
                                  await fetch("/api/approve-submission", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      submissionId: s._id,
                                      accepted: true,
                                    })
                                  });
                                  window.location.reload();
                                }}
                                color={s.rejected ? "green.600" : undefined}
                                fontWeight={s.rejected ? "semibold" : undefined}
                              >
                                {s.rejected ? "✓ Approve Submission" : "Approve Submission"}
                              </MenuItem>
                            )}
                            {!s.rejected && (
                              <MenuItem
                                onClick={async () => {
                                  await fetch("/api/approve-submission", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      submissionId: s._id,
                                      rejected: true,
                                    })
                                  });
                                  window.location.reload();
                                }}
                                color={s.accepted ? "red.600" : undefined}
                                fontWeight={s.accepted ? "semibold" : undefined}
                              >
                                {s.accepted ? "✗ Reject Submission" : "Reject Submission"}
                              </MenuItem>
                            )}
                            {(s.accepted || s.rejected) && (
                              <MenuItem
                                onClick={async () => {
                                  await fetch("/api/approve-submission", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      submissionId: s._id,
                                      accepted: false,
                                      rejected: false,
                                    })
                                  });
                                  window.location.reload();
                                }}
                                color="blue.600"
                              >
                                ↺ Reset to Pending
                              </MenuItem>
                            )}
                          </>
                        )}
                        <MenuItem
                          onClick={() => {
                            router.push(`/update-submission/${s._id}`);
                          }}
                        >
                          {s.mediaURL ? "Update Video" : "Add Video"}
                        </MenuItem>
                        {isAdmin && (
                          <MenuItem
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm("Are you sure you want to delete this submission? This action cannot be undone.")) {
                                try {
                                  const response = await fetch("/api/delete-submission", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      submissionId: s._id,
                                    })
                                  });
                                  if (response.ok) {
                                    window.location.reload();
                                  } else {
                                    const data = await response.json();
                                    alert(data.error || "Failed to delete submission");
                                  }
                                } catch (error) {
                                  alert("Failed to delete submission");
                                }
                              }
                            }}
                            color="red.600"
                            _hover={{ bg: "red.50" }}
                          >
                            Delete Submission
                          </MenuItem>
                        )}
                      </MenuList>
                    </Menu>
                    </Box>
                  )}
                  <ChevronDownIcon
                    w={5}
                    h={5}
                    color="gray.500"
                    className={
                      s._id === selectedSubmission ? "chevron rotate" : "chevron"
                    }
                  />
                </Flex>
              </Flex>

              {s._id === selectedSubmission && (
                <Flex 
                  direction="column" 
                  gap={4} 
                  px={4} 
                  pb={4}
                  pt={2}
                  borderTop="1px"
                  borderColor="gray.100"
                  className="expandable-content"
                >
                  {s.mediaURL && (
                    <Box width="100%" display="flex" justifyContent="center">
                      {s.mediaURL.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/i) && (
                        <Image
                          maxWidth="100%"
                          maxHeight="500px"
                          src={s.mediaURL}
                          alt={s.note}
                          objectFit="contain"
                          borderRadius="md"
                          boxShadow="sm"
                        />
                      )}
                      {s.mediaURL.toLowerCase().match(/\.(mpg|mp2|mpeg|mpe|mpv|mov|mp4|webm)$/i) && (
                        <Box
                          as="video"
                          controls
                          src={s.mediaURL}
                          width="100%"
                          maxWidth="800px"
                          objectFit="contain"
                          borderRadius="md"
                          boxShadow="sm"
                          sx={{
                            aspectRatio: "16/9"
                          }}
                        />
                      )}
                      {!s.mediaURL.match(/\.(jpg|jpeg|png|gif)$/i) &&
                        !s.mediaURL.match(/\.(mpg|mp2|mpeg|mpe|mpv|mov|mp4|webm)$/i) && (
                        <Link 
                          href={s.mediaURL}
                          color="blue.600"
                          fontWeight="medium"
                          _hover={{ textDecoration: "underline" }}
                        >
                          View media
                        </Link>
                      )}
                    </Box>
                  )}
                  {s.note && (
                    <Box 
                      bg="gray.50" 
                      p={4} 
                      borderRadius="md"
                      borderLeft="3px solid"
                      borderColor="gray.300"
                    >
                      <Text color="gray.700" lineHeight="tall">
                        {s.note}
                      </Text>
                    </Box>
                  )}
                </Flex>
              )}
            </Card>
          ))}
        </VStack>
      )}
    </NavContainer>
  ) : (
    <CountdownPage startTime={parseISO(startTimeISO)} scavengerHuntName={scavengerHuntName} showHowToPlay={showHowToPlay}/>
  );
}
