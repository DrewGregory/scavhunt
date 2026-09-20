import { GetServerSidePropsContext } from "next";
import NavContainer from "../components/NavContainer";
import { Card, Flex, Heading, ListItem, UnorderedList } from "@chakra-ui/react";
import { useState } from "react";
import { Text } from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { formatISO, parseISO } from "date-fns";
import { getEndTime, getStartTime } from "../lib/time";
import { prisma } from "../lib/prisma";
import { requireUserSSP } from "../lib/auth";
import {
  serializeSubmission,
  serializeTeam,
} from "../lib/serialize";
import type { SerializedSubmission, SerializedTeam } from "../lib/types";

const ResponsiveLine = dynamic(
  () => import("@nivo/line").then((m) => m.ResponsiveLine),
  { ssr: false },
);

type TeamMember = { id: string; name: string };

type TeamWithPts = SerializedTeam & {
  submissions: SerializedSubmission[];
  members: TeamMember[];
  pts: number;
  ptsArray: number[];
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const teamsRaw = await prisma.team.findMany({
    include: {
      users: { select: { id: true, name: true } },
      submissions: {
        orderBy: { createdAt: "asc" },
        include: { challenge: true },
      },
    },
  });

  const teamsWithPts: TeamWithPts[] = teamsRaw.map((t) => {
    const accepted = t.submissions.filter((s) => s.accepted);
    const ptsArray = accepted.map((s) => s.challenge.pts);
    return {
      ...serializeTeam(t),
      members: t.users.map((u) => ({ id: u.id, name: u.name })),
      submissions: t.submissions.map(serializeSubmission),
      pts: ptsArray.reduce((sum, p) => sum + p, 0),
      ptsArray,
    };
  });

  const teamsSortedbyPts = teamsWithPts.sort((t1, t2) => t2.pts - t1.pts);
  const [startTime, endTime] = await Promise.all([
    getStartTime(),
    getEndTime(),
  ]);
  return {
    props: {
      teamsSortedbyPts,
      startTimeISO: formatISO(startTime),
      endTimeISO: formatISO(endTime),
    },
  };
};

export default function Page({
  teamsSortedbyPts,
  endTimeISO,
  startTimeISO,
}: {
  teamsSortedbyPts: Array<TeamWithPts>;
  startTimeISO: string;
  endTimeISO: string;
}) {
  const searchParams = useSearchParams();
  const teamSearchParam = searchParams.get("team");

  const startTime = parseISO(startTimeISO);
  const endTime = parseISO(endTimeISO);
  const pointData = teamsSortedbyPts.map((t) => {
    let data: any = [{ x: startTime, y: 0 }];
    let totalPts = 0;
    let index = 0;
    for (let i = 0; i < t.submissions.length; i++) {
      if (!t.submissions[i].accepted) {
        continue;
      }
      const submission = t.submissions[i];
      totalPts += t.ptsArray[index];
      data.push({
        x: new Date(submission.createdAt),
        y: totalPts,
      });
      index += 1;
    }
    return {
      id: t.emoji + " " + t.name,
      data: data,
    };
  });
  const maxScore = teamsSortedbyPts.reduce((max, t) => Math.max(max, t.pts), 0);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(
    teamSearchParam,
  );

  const maxDate =
    new Date() < startTime
      ? startTime
      : new Date() > endTime
        ? endTime
        : new Date();
  return (
    <NavContainer title="Leaderboard">
      <Card height={450} p={4} mb={4} boxShadow="sm" borderRadius="lg">
        <ResponsiveLine
          data={pointData}
          margin={{ top: 50, right: 100, bottom: 75, left: 60 }}
          xScale={{
            format: "%Y-%m-%d, %H:%M:%S",
            type: "time",
            precision: "minute",
            min: startTime,
            max: maxDate,
            useUTC: true,
          }}
          xFormat="time:%Y-%m-%d %H:%M:%S"
          yScale={{
            type: "linear",
            min: 0,
            max: Math.max(50, maxScore + 10),
            stacked: false,
            reverse: false,
          }}
          yFormat=" >-.2f"
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 90,
            format: "%H:%M",
            legend: "Time",
            legendOffset: 50,
            legendPosition: "middle",
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: "Points",
            legendOffset: -40,
            legendPosition: "middle",
            truncateTickAt: 0,
          }}
          pointSize={0}
          colors={{ scheme: "set3" }}
          pointLabel="data.yFormatted"
          pointLabelYOffset={-12}
          enableTouchCrosshair={true}
          enableSlices="x"
          useMesh={true}
          legends={[
            {
              anchor: "bottom-right",
              direction: "column",
              justify: false,
              translateX: 110,
              translateY: 0,
              itemsSpacing: 0,
              itemDirection: "left-to-right",
              itemWidth: 100,
              itemHeight: 20,
              itemOpacity: 0.75,
              symbolSize: 12,
              symbolShape: "circle",
              symbolBorderColor: "rgba(0, 0, 0, .5)",
              effects: [
                {
                  on: "hover",
                  style: {
                    itemBackground: "rgba(0, 0, 0, .03)",
                    itemOpacity: 1,
                  },
                },
              ],
            },
          ]}
        />
      </Card>
      <Flex direction="column" gap={4}>
        {teamsSortedbyPts.map((t, index) => (
          <Card
            key={t.id}
            cursor="pointer"
            onClick={() => {
              setSelectedTeam(t.id === selectedTeam ? null : t.id);
            }}
            className={t.id === selectedTeam ? "card open" : "card"}
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
              >
                <Flex alignItems="center" gap={3} flex={1}>
                  <Text
                    fontSize="lg"
                    fontWeight="bold"
                    color="gray.500"
                    minWidth="30px"
                  >
                    #{index + 1}
                  </Text>
                  <Text fontSize="lg" fontWeight="semibold" color="gray.800">
                    {t.emoji} {t.name}
                  </Text>
                </Flex>
                <Flex alignItems="center" gap={2}>
                  <Text fontWeight="bold" color="gray.700" fontSize="md">
                    {t.pts} pts
                  </Text>
                  <ChevronDownIcon
                    w={5}
                    h={5}
                    color="gray.500"
                    className={
                      t.id === selectedTeam ? "chevron rotate" : "chevron"
                    }
                  />
                </Flex>
              </Flex>
              {selectedTeam === t.id && (
                <Flex
                  direction="column"
                  px={4}
                  pb={4}
                  pt={2}
                  borderTop="1px"
                  borderColor="gray.100"
                  className="expandable-content"
                >
                  <Heading size="sm" mb={3} color="gray.700">
                    Team Members
                  </Heading>
                  <UnorderedList spacing={1} ml={4}>
                    {t.members.map((m) => (
                      <ListItem key={m.id} color="gray.600">
                        {m.name}
                      </ListItem>
                    ))}
                  </UnorderedList>
                </Flex>
              )}
            </Flex>
          </Card>
        ))}
      </Flex>
    </NavContainer>
  );
}
