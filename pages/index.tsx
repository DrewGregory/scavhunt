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
  Link,
  Tag,
  Text,
  VStack,
  Image,
  Box
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { z } from "zod";
import { serializedChallengeSchema } from "../models/Challenge";
import { ADMIN_TEAM_ID, getTeamFromCookie } from "../lib/team";
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

  if (teamRaw == null) {
    return {
      props: {
        team: null,
        submissions: [],
        startTimeISO: formatISO(startTime),
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

  return {
    props: {
      team,
      submissions,
      startTimeISO: formatISO(startTime),
    }
  };
};

const HowToPlay = dynamic(() => import("../components/HowToPlay"), {
  ssr: false
});

export default function Page({
  team,
  submissions,
  startTimeISO,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionSearchParam = searchParams.get("submission");
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(
    submissionSearchParam
  );

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = ref.current;
    if (current != null) {
      current.scrollIntoView();
    }
  }, [ref.current, submissionSearchParam]);


  return team != null ? (
    <NavContainer title="Home">
      {submissions.length === 0 ? (
        <Heading>No Submissions Yet!</Heading>
      ) : (
        <VStack justifyContent="flex-start" width="100%">
          {submissions.map((s) => (
            <Card
              ref={s._id === submissionSearchParam ? ref : null}
              key={s._id}
              p="2"
              width="100%"
              className={s._id === selectedSubmission ? "card open" : "card"}
            >
              <Flex
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                p={2}
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
                <Text flex={1}>
                  Submission by for <b>{s.challenge.title}</b>!
                </Text>

                <Tag mr={3} colorScheme={s.accepted ? "green" : (s.rejected ? "red" :"orange")}>
                  {s.accepted ? "Accepted" : (s.rejected ? "Rejected" : "Pending review")}
                </Tag>
                <ChevronDownIcon
                  className={
                    s._id === selectedSubmission ? "chevron rotate" : "chevron"
                  }
                />
              </Flex>
              <Flex alignItems="left" p={2} direction="column">
                <Text mr={3} suppressHydrationWarning>
                  {formatDistance(new Date(s.createdAt), new Date())} ago by{" "}
                  <Link href={`/teams?team=${team._id}`}>
                    {s.team.emoji} {s.team.name}
                  </Link>
                </Text>
              </Flex>
              {s._id === selectedSubmission && (
                <Flex alignItems="center" p={2} direction="column">
                  {s.mediaURL &&
                    s.mediaURL
                      .toLowerCase()
                      .match(/\.(jpg|jpeg|png|gif)$/i) && (
                      <>
                        <Image
                          maxWidth="50%"
                          src={s.mediaURL}
                          alt={s.note}
                          objectFit="cover"
                        />
                      </>
                    )}
                  {s.mediaURL &&
                    s.mediaURL
                      .toLowerCase()
                      .match(/\.(mpg|mp2|mpeg|mpe|mpv|mov|mp4)$/i) && (
                      <>
                        <Box
                          as="video"
                          controls
                          src={s.mediaURL}
                          objectFit="contain"
                          sx={{
                            aspectRatio: "16/9"
                          }}
                        />
                      </>
                    )}
                  {s.mediaURL &&
                    !s.mediaURL.match(/\.(jpg|jpeg|png|gif)$/i) &&
                    !s.mediaURL.match(/\.(mpg|mp2|mpeg|mpe|mpv|mp4)$/i) && (
                      <a href={s.mediaURL}>View media</a>
                    )}
                  <Text marginTop={3}>{s.note}</Text>
                </Flex>
              )}
              {team._id === ADMIN_TEAM_ID && !s.accepted && !s.rejected ? (
                <>
                  <Button
                    style={{
                      margin: "2px"
                    }}
                    onClick={async () => {
                      await fetch("/api/approve-submission", {
                        method: "POST",
                        body: JSON.stringify({
                          submissionId: s._id,
                          accepted: true,
                        })
                      });
                    }}
                  >
                    Approve Submission!
                  </Button>
                  <Button
                  style={{
                    margin: "2px"
                  }}
                  onClick={async () => {
                    await fetch("/api/approve-submission", {
                      method: "POST",
                      body: JSON.stringify({
                        submissionId: s._id,
                        accepted: false,
                      })
                    });
                  }}
                >
                  Reject Submission!
                </Button>
              </>
              ) : null}
            </Card>
          ))}
        </VStack>
      )}
    </NavContainer>
  ) : (
    <HowToPlay startTime={parseISO(startTimeISO)}/>
  );
}
