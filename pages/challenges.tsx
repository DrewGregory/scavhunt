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
  Select,
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
      },
      {
        $sort: {
          pts: -1
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

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = ref.current;
    if (current != null) {
      current.scrollIntoView();
    }
  }, [ref.current, challengeSearchParam]);

  const team = useTeam();
  
  // Sort challenges based on selected option
  const sortedChallenges = sortOption === 'default' 
    ? challenges 
    : [...challenges].sort((a, b) => {
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
      <VStack>
        <Select 
          value={sortOption} 
          onChange={(e) => setSortOption(e.target.value as SortOption)}
          width="100%"
          mb={2}
        >
          <option value="default">Default</option>
          <option value="points-high">Points: High to Low</option>
          <option value="points-low">Points: Low to High</option>
        </Select>
        {sortedChallenges.map((c) => (
          <Card
            ref={c._id === challengeSearchParam ? ref : null}
            key={c._id}
            width="100%"
            p={2}
            onClick={() => {
              setSelectedChallenge(c._id === selectedChallenge ? null : c._id);
            }}
            className={c._id === selectedChallenge ? "card open" : "card"}
          >
            <Flex direction="column">
              <Flex
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                p={2}
              >
                <Heading size="sm" flex={1} mr={2}>
                  {c.title}
                </Heading>
                <Text mr={1}>{c.pts} points</Text>
                <ChevronDownIcon
                  className={
                    c._id === selectedChallenge ? "chevron rotate" : "chevron"
                  }
                />
              </Flex>
              <Flex
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                p={2}
              >
                <Text mr={1}>
                  {c.submissions.filter(s => s.accepted).length} accepted, {c.submissions.filter(s => !s.accepted && !s.rejected).length} pending /{c.numWinners} submission
                  {c.numWinners == 1 ? "" : "s"}
                </Text>
              </Flex>
              {c._id === selectedChallenge && (
                <VStack pt={2} spacing={2} alignItems="left">
                  <Text fontSize="sm">{c.prompt}</Text>
                  {team == null ? null : (
                    <Button
                      onClick={(e) => {
                        router.push(`/submit/${c._id}`);
                        e.stopPropagation();
                      }}
                    >
                      Submit
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
