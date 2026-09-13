import {
  ChallengeModel,
  serializedChallengeSchema,
} from "../models/Challenge";
import { GetServerSideProps } from "next";
import { dbConnect } from "../lib/dbConnect";
import {
  Button,
  Card,
  Flex,
  Heading,
  HStack,
  Input,
  Select,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { useRouter, useSearchParams } from "next/navigation";
import NavContainer from "../components/NavContainer";
import { useTeam } from "../components/useTeam";
import { z } from "zod";
import { getTeamFromCookie } from "../lib/team";
import { serializedSubmissionSchema } from "../models/Submission";

const challengeWithSubmissionsSchema = serializedChallengeSchema.merge(
  z.object({
    submissions: z.array(serializedSubmissionSchema)
  })
);

type ChallengeWithSubmissions = z.infer<typeof challengeWithSubmissionsSchema>;

export const getServerSideProps: GetServerSideProps = async (context) => {
  await dbConnect();
  const challenges = await (async () => {
    const team = await getTeamFromCookie(context.req.cookies);
    if (team == null) {
      return [];
    }
    return ChallengeModel.aggregate([
      {
        $lookup: {
          from: "submissions",
          localField: "_id",
          foreignField: "challengeId",
          as: "submissions"
        }
      }
    ]);
  })();
  return {
    props: {
      challenges: z.array(challengeWithSubmissionsSchema).parse(challenges).map(c => {
        return {
          ...c,
          submissions: c.submissions.filter(s => !s.rejected),
        }
      })
    }
  };
};

type SortOption = 'default' | 'points-high' | 'points-low';

export default function Page({
  challenges
}: {
  challenges: Array<ChallengeWithSubmissions>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const challengeSearchParam = searchParams.get("challenge");
  const [selectedChallenge, setSelectedChallenge] = useState<string | null>(
    challengeSearchParam
  );
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hideCompleted, setHideCompleted] = useState<boolean>(false);
  const [hideFullChallenges, setHideFullChallenges] = useState<boolean>(false);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = ref.current;
    if (current != null) {
      current.scrollIntoView();
    }
  }, [ref.current, challengeSearchParam]);

  const team = useTeam();
  
  // Filter challenges based on search query (case-insensitive)
  const searchFilteredChallenges = searchQuery.trim() === '' 
    ? challenges 
    : challenges.filter(c => 
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.prompt.toLowerCase().includes(searchQuery.toLowerCase())
      );
  
  // Filter out completed challenges if hideCompleted is true
  const completedFilteredChallenges = hideCompleted && team
    ? searchFilteredChallenges.filter(c => 
        !c.submissions.some(s => s.teamId === (team as any)._id && s.accepted)
      )
    : searchFilteredChallenges;
  
  // Filter out full challenges if hideFullChallenges is true
  const fullFilteredChallenges = hideFullChallenges
    ? completedFilteredChallenges.filter(c => 
        c.submissions.filter(s => s.accepted).length < c.numWinners
      )
    : completedFilteredChallenges;
  
  // Sort challenges based on selected option
  const sortedChallenges = sortOption === 'default' 
    ? fullFilteredChallenges 
    : [...fullFilteredChallenges].sort((a, b) => {
        switch (sortOption) {
          case 'points-high':
            return b.pts - a.pts;
          case 'points-low':
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
                Hide challenges you've finished
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
            ref={c._id === challengeSearchParam ? ref : null}
            key={c._id}
            width="100%"
            className={c._id === selectedChallenge ? "card open" : "card"}
            boxShadow="sm"
            _hover={{ boxShadow: "md" }}
            transition="all 0.2s"
            borderRadius="lg"
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
                  setSelectedChallenge(c._id === selectedChallenge ? null : c._id);
                }}
              >
                <Heading size="md" flex={1} color="gray.800">
                  {c.title}
                </Heading>
                <Flex alignItems="center" gap={2}>
                  <Text fontWeight="semibold" color="gray.700" fontSize="md">
                    {c.pts} pts
                  </Text>
                  <ChevronDownIcon
                    w={5}
                    h={5}
                    color="gray.500"
                    className={
                      c._id === selectedChallenge ? "chevron rotate" : "chevron"
                    }
                  />
                </Flex>
              </Flex>
              <Flex
                direction="row"
                px={4}
                pb={c._id === selectedChallenge ? 2 : 4}
              >
                <Text fontSize="sm" color="gray.600">
                  {c.submissions.filter(s => s.accepted).length} of {c.numWinners} spot{c.numWinners === 1 ? "" : "s"} filled • {c.submissions.filter(s => !s.accepted && !s.rejected).length} pending approval
                </Text>
              </Flex>
              {c._id === selectedChallenge && (
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
                          color: "blue.700"
                        }
                      }
                    }}
                    dangerouslySetInnerHTML={{ 
                      __html: c.prompt.replace(
                        /(https?:\/\/[^\s]+)/g, 
                        '<a href="$1" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">$1</a>'
                      )
                    }}
                  />
                  {team != null && (
                    <Button
                      colorScheme="blue"
                      size="md"
                      onClick={(e) => {
                        router.push(`/submit/${c._id}`);
                        e.stopPropagation();
                      }}
                      width="fit-content"
                    >
                      Submit Challenge
                    </Button>
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
