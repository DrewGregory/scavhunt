import { GetServerSidePropsContext } from "next";
import NavContainer from "../components/NavContainer";
import {
  Box,
  Card,
  Flex,
  Heading,
  ListItem,
  Text,
  UnorderedList,
} from "@chakra-ui/react";
import { useState } from "react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { formatISO, parseISO } from "date-fns";
import { getEndTime, getStartTime } from "../lib/time";
import { prisma } from "../lib/prisma";
import { requireUserSSP } from "../lib/auth";
import { serializeSubmission, serializeTeam } from "../lib/serialize";
import type { SerializedSubmission, SerializedTeam } from "../lib/types";
import { isTerritoryEnabled } from "../lib/territoryGate";
import { getStandings, territoryLeaderboard } from "../lib/territory";
import { scoreFromParts } from "../lib/scoring";

const ResponsiveLine = dynamic(
  () => import("@nivo/line").then((m) => m.ResponsiveLine),
  { ssr: false },
);

type TeamMember = { id: string; name: string };

type TeamWithPts = SerializedTeam & {
  submissions: SerializedSubmission[];
  members: TeamMember[];
  /** Leaderboard score = earned - deposited */
  pts: number;
  earned: number;
  deposited: number;
  ptsArray: number[];
};

type TerritoryRow = {
  teamId: string;
  teamName: string;
  teamEmoji: string;
  teamColor: string;
  neighborhoodsHeld: number;
  totalDeposited: number;
};

type HeldNeighborhood = {
  id: string;
  name: string;
  emoji: string | null;
  claimedByTeamId: string | null;
  contested: boolean;
  totalDeposited: number;
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const teamsRaw = await prisma.team.findMany({
    where: { deletedAt: null },
    include: {
      users: {
        where: { deletedAt: null },
        select: { id: true, name: true },
      },
      submissions: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { challenge: true },
      },
      deposits: {
        where: { deletedAt: null },
        select: { points: true },
      },
    },
  });

  const teamsWithPts: TeamWithPts[] = teamsRaw.map((t) => {
    const accepted = t.submissions.filter((s) => s.accepted);
    const ptsArray = accepted.map((s) => s.challenge.pts);
    const earned = ptsArray.reduce((sum, p) => sum + p, 0);
    const deposited = t.deposits.reduce((sum, d) => sum + d.points, 0);
    const bonus = t.bonusPoints;
    return {
      ...serializeTeam(t),
      members: t.users.map((u) => ({ id: u.id, name: u.name })),
      submissions: t.submissions.map(serializeSubmission),
      earned,
      deposited,
      pts: scoreFromParts(earned, deposited, bonus),
      ptsArray,
    };
  });

  const teamsSortedbyPts = teamsWithPts.sort((t1, t2) => t2.pts - t1.pts);
  const [startTime, endTime, territoryEnabled] = await Promise.all([
    getStartTime(),
    getEndTime(),
    isTerritoryEnabled(),
  ]);

  let territoryRows: TerritoryRow[] = [];
  let heldNeighborhoods: HeldNeighborhood[] = [];

  if (territoryEnabled) {
    const standings = await getStandings({
      onMapOnly: true,
      includeBoundary: false,
    });
    const rows = territoryLeaderboard(
      standings,
      teamsRaw.map((t) => ({
        id: t.id,
        name: t.name,
        emoji: t.emoji,
        color: t.color,
      })),
    );
    territoryRows = rows.map((r) => ({
      teamId: r.teamId,
      teamName: r.teamName,
      teamEmoji: r.teamEmoji,
      teamColor: r.teamColor,
      neighborhoodsHeld: r.neighborhoodsHeld,
      totalDeposited: r.totalDeposited,
    }));
    heldNeighborhoods = standings.map((s) => ({
      id: s.neighborhoodId,
      name: s.name,
      emoji: s.emoji,
      claimedByTeamId: s.claimedBy?.teamId ?? null,
      contested: s.contested,
      totalDeposited: s.totalDeposited,
    }));
  }

  return {
    props: {
      teamsSortedbyPts,
      startTimeISO: formatISO(startTime),
      endTimeISO: formatISO(endTime),
      territoryEnabled,
      territoryRows: territoryEnabled ? territoryRows : [],
      heldNeighborhoods: territoryEnabled ? heldNeighborhoods : [],
    },
  };
};

export default function Page({
  teamsSortedbyPts,
  endTimeISO,
  startTimeISO,
  territoryEnabled,
  territoryRows,
  heldNeighborhoods,
}: {
  teamsSortedbyPts: Array<TeamWithPts>;
  startTimeISO: string;
  endTimeISO: string;
  territoryEnabled: boolean;
  territoryRows: TerritoryRow[];
  heldNeighborhoods: HeldNeighborhood[];
}) {
  const searchParams = useSearchParams();
  const teamSearchParam = searchParams.get("team");

  const startTime = parseISO(startTimeISO);
  const endTime = parseISO(endTimeISO);

  // Chart tracks earned over time (unaffected by deposits).
  const pointData = teamsSortedbyPts.map((t) => {
    const data: Array<{ x: Date; y: number }> = [{ x: startTime, y: 0 }];
    let totalPts = 0;
    let index = 0;
    for (let i = 0; i < t.submissions.length; i++) {
      if (!t.submissions[i].accepted) continue;
      totalPts += t.ptsArray[index];
      data.push({
        x: new Date(t.submissions[i].createdAt),
        y: totalPts,
      });
      index += 1;
    }
    return { id: `${t.emoji} ${t.name}`, data };
  });

  const maxEarned = teamsSortedbyPts.reduce(
    (max, t) => Math.max(max, t.earned),
    0,
  );
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
            max: Math.max(50, maxEarned + 10),
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
            legend: "Points earned",
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

      <Heading size="md" mb={2} color="gray.700">
        Points
      </Heading>
      <Text fontSize="sm" color="gray.600" mb={3}>
        Score = points earned − points deposited into neighborhoods.
      </Text>
      <Flex direction="column" gap={4} mb={8}>
        {teamsSortedbyPts.map((t, index) => (
          <Card
            key={t.id}
            cursor="pointer"
            onClick={() =>
              setSelectedTeam(t.id === selectedTeam ? null : t.id)
            }
            boxShadow="sm"
            _hover={{ boxShadow: "md" }}
            transition="all 0.2s"
            borderRadius="lg"
            borderLeftWidth="4px"
            borderLeftColor={t.color || "gray.300"}
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
                  <Box textAlign="right">
                    <Text fontWeight="bold" color="gray.700" fontSize="md">
                      {t.pts} pts
                    </Text>
                    {t.deposited > 0 && (
                      <Text fontSize="xs" color="gray.500">
                        earned {t.earned} · spent {t.deposited}
                      </Text>
                    )}
                  </Box>
                  <ChevronDownIcon
                    w={5}
                    h={5}
                    color="gray.500"
                    transform={
                      t.id === selectedTeam ? "rotate(180deg)" : undefined
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

      {territoryEnabled && (
        <>
          <Heading size="md" mb={2} color="gray.700">
            Territory
          </Heading>
          <Text fontSize="sm" color="gray.600" mb={3}>
            Neighborhoods held (strict lead; ties stay contested). Separate from
            the points board.
          </Text>
          <Flex direction="column" gap={3} mb={6}>
            {territoryRows.map((row, index) => (
              <Card
                key={row.teamId}
                p={4}
                boxShadow="sm"
                borderRadius="lg"
                borderLeftWidth="4px"
                borderLeftColor={row.teamColor}
              >
                <Flex justify="space-between" align="center">
                  <Flex align="center" gap={3}>
                    <Text fontWeight="bold" color="gray.500" minW="30px">
                      #{index + 1}
                    </Text>
                    <Text fontWeight="semibold">
                      {row.teamEmoji} {row.teamName}
                    </Text>
                  </Flex>
                  <Box textAlign="right">
                    <Text fontWeight="bold">
                      {row.neighborhoodsHeld} neighborhood
                      {row.neighborhoodsHeld === 1 ? "" : "s"}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {row.totalDeposited} pts deposited
                    </Text>
                  </Box>
                </Flex>
              </Card>
            ))}
          </Flex>

          <Heading size="sm" mb={2} color="gray.700">
            Neighborhood control
          </Heading>
          <Flex direction="column" gap={2} mb={8}>
            {heldNeighborhoods.map((n) => {
              const holder = territoryRows.find(
                (r) => r.teamId === n.claimedByTeamId,
              );
              return (
                <Flex
                  key={n.id}
                  justify="space-between"
                  align="center"
                  bg="white"
                  p={3}
                  borderRadius="md"
                  boxShadow="sm"
                >
                  <Text fontWeight="medium">
                    {n.emoji ?? ""} {n.name}
                  </Text>
                  <Text fontSize="sm" color="gray.600">
                    {n.contested
                      ? "Contested"
                      : holder
                        ? `${holder.teamEmoji} ${holder.teamName}`
                        : "Unclaimed"}
                    {n.totalDeposited > 0 ? ` · ${n.totalDeposited} pts` : ""}
                  </Text>
                </Flex>
              );
            })}
          </Flex>
        </>
      )}
    </NavContainer>
  );
}
