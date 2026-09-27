import { GetServerSidePropsContext } from "next";
import NavContainer from "../components/NavContainer";
import {
  Alert,
  AlertIcon,
  Box,
  Collapse,
  Flex,
  Heading,
  IconButton,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { parseISO } from "date-fns";
import { useRouter } from "next/router";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { LuMap, LuTrophy } from "react-icons/lu";
import { requireHuntStartedSSP } from "../lib/time";
import { requireUserSSP } from "../lib/auth";
import {
  getLeaderboardPayload,
  type ClaimedNeighborhood,
  type ClaimSeries,
  type LeaderboardPayload,
  type TeamMember,
} from "../lib/leaderboard";

const ResponsiveLine = dynamic(
  () => import("@nivo/line").then((m) => m.ResponsiveLine),
  { ssr: false },
);

type BoardView = "neighborhoods" | "points";

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const huntRedirect = await requireHuntStartedSSP(auth.user.isAdmin);
  if (huntRedirect) return { redirect: huntRedirect };

  return { props: await getLeaderboardPayload() };
};

function formatNeighborhoods(list: ClaimedNeighborhood[]): string {
  if (list.length === 0) return "No neighborhoods claimed";
  return list
    .map((n) => (n.emoji ? `${n.emoji} ${n.name}` : n.name))
    .join(", ");
}

function formatMembers(members: TeamMember[]): string {
  if (members.length === 0) return "No members yet";
  return members.map((m) => m.name).join(", ");
}

function Podium({
  items,
}: {
  items: Array<{
    id: string;
    label: string;
    emoji: string;
    color: string;
    primary: string;
  }>;
}) {
  const first = items[0];
  const second = items[1];
  const third = items[2];
  if (!first) return null;

  const Slot = ({
    place,
    item,
    height,
    order,
  }: {
    place: 1 | 2 | 3;
    item: (typeof items)[0] | undefined;
    height: string;
    order: number;
  }) => {
    if (!item) {
      return <Box flex={1} order={order} />;
    }
    return (
      <Flex
        flex={1}
        order={order}
        direction="column"
        align="center"
        justify="flex-end"
        minW={0}
        px={1}
      >
        <Text fontSize={{ base: "xl", md: "2xl" }} lineHeight={1} mb={1}>
          {item.emoji}
        </Text>
        <Text
          fontWeight="semibold"
          textAlign="center"
          noOfLines={2}
          fontSize={{ base: "xs", md: "sm" }}
          color="gray.700"
          mb={1}
        >
          {item.label}
        </Text>
        <Text fontSize="xs" color="gray.500" mb={2}>
          {item.primary}
        </Text>
        <Box
          w="100%"
          h={height}
          bg={
            place === 1
              ? "yellow.100"
              : place === 2
                ? "gray.100"
                : "orange.50"
          }
          borderTopRadius="md"
          borderTopWidth="2px"
          borderTopColor={item.color || "gray.300"}
          display="flex"
          alignItems="flex-start"
          justifyContent="center"
          pt={1.5}
        >
          <Text fontWeight="bold" fontSize="sm" color="gray.500">
            {place}
          </Text>
        </Box>
      </Flex>
    );
  };

  return (
    <Box
      bg="white"
      borderRadius="lg"
      boxShadow="sm"
      px={{ base: 2, md: 4 }}
      pt={4}
      pb={0}
      mb={4}
      overflow="hidden"
    >
      <Flex align="flex-end" gap={{ base: 1, md: 2 }} minH="160px">
        <Slot place={2} item={second} height="56px" order={1} />
        <Slot place={1} item={first} height="80px" order={2} />
        <Slot place={3} item={third} height="44px" order={3} />
      </Flex>
    </Box>
  );
}

function DetailRows({
  members,
  claimedNeighborhoods,
  showNeighborhoods,
}: {
  members: TeamMember[];
  claimedNeighborhoods: ClaimedNeighborhood[];
  showNeighborhoods: boolean;
}) {
  return (
    <Box px={1} py={2}>
      <Text fontSize="sm" color="gray.500" lineHeight="short">
        <Text as="span" fontWeight="medium" color="gray.600">
          Members:{" "}
        </Text>
        {formatMembers(members)}
      </Text>
      {showNeighborhoods && (
        <Text fontSize="sm" color="gray.500" lineHeight="short" mt={1}>
          <Text as="span" fontWeight="medium" color="gray.600">
            Holding:{" "}
          </Text>
          {formatNeighborhoods(claimedNeighborhoods)}
        </Text>
      )}
    </Box>
  );
}

export default function Page(initial: LeaderboardPayload) {
  const router = useRouter();
  const [teamsSortedbyPts, setTeams] = useState(initial.teamsSortedbyPts);
  const [territoryRows, setTerritoryRows] = useState(initial.territoryRows);
  const [claimSeries, setClaimSeries] = useState<ClaimSeries[]>(
    initial.claimSeries ?? [],
  );
  const [territoryEnabled, setTerritoryEnabled] = useState(
    initial.territoryEnabled,
  );
  const [startTimeISO, setStartTimeISO] = useState(initial.startTimeISO);
  const [endTimeISO, setEndTimeISO] = useState(initial.endTimeISO);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setTeams(initial.teamsSortedbyPts);
    setTerritoryRows(initial.territoryRows);
    setClaimSeries(initial.claimSeries ?? []);
    setTerritoryEnabled(initial.territoryEnabled);
    setStartTimeISO(initial.startTimeISO);
    setEndTimeISO(initial.endTimeISO);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/teams-live");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as LeaderboardPayload;
        if (cancelled) return;
        if (Array.isArray(data.teamsSortedbyPts)) {
          setTeams(data.teamsSortedbyPts);
        }
        if (Array.isArray(data.territoryRows)) {
          setTerritoryRows(data.territoryRows);
        }
        if (Array.isArray(data.claimSeries)) {
          setClaimSeries(data.claimSeries);
        }
        if (typeof data.territoryEnabled === "boolean") {
          setTerritoryEnabled(data.territoryEnabled);
        }
        if (typeof data.startTimeISO === "string") {
          setStartTimeISO(data.startTimeISO);
        }
        if (typeof data.endTimeISO === "string") {
          setEndTimeISO(data.endTimeISO);
        }
      } catch {
        /* ignore */
      }
    };
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const viewParam = router.query.view;
  const view: BoardView = !territoryEnabled
    ? "points"
    : viewParam === "points"
      ? "points"
      : "neighborhoods";

  const setView = useCallback(
    (next: BoardView) => {
      void router.push(
        { pathname: "/teams", query: { view: next } },
        undefined,
        { shallow: true },
      );
    },
    [router],
  );

  const startTime = parseISO(startTimeISO);
  const endTime = parseISO(endTimeISO);

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

  const claimChartData = useMemo(
    () =>
      claimSeries.map((s) => ({
        id: s.id,
        data: s.data.map((p) => ({ x: new Date(p.x), y: p.y })),
      })),
    [claimSeries],
  );

  const maxEarned = teamsSortedbyPts.reduce(
    (max, t) => Math.max(max, t.earned),
    0,
  );

  const maxHeld = territoryRows.reduce(
    (max, r) => Math.max(max, r.neighborhoodsHeld),
    0,
  );

  const maxDate =
    new Date() < startTime
      ? startTime
      : new Date() > endTime
        ? endTime
        : new Date();

  const pointsPodium = useMemo(
    () =>
      teamsSortedbyPts.slice(0, 3).map((t) => ({
        id: t.id,
        label: t.name,
        emoji: t.emoji,
        color: t.color,
        primary: `${t.pts} pts`,
      })),
    [teamsSortedbyPts],
  );

  const territoryPodium = useMemo(
    () =>
      territoryRows.slice(0, 3).map((r) => ({
        id: r.teamId,
        label: r.teamName,
        emoji: r.teamEmoji,
        color: r.teamColor,
        primary: `${r.neighborhoodsHeld} neighborhood${
          r.neighborhoodsHeld === 1 ? "" : "s"
        }`,
      })),
    [territoryRows],
  );

  const viewToggle =
    territoryEnabled ? (
      <IconButton
        aria-label={
          view === "neighborhoods"
            ? "Show points leaderboard"
            : "Show neighborhood leaderboard"
        }
        icon={view === "neighborhoods" ? <LuTrophy /> : <LuMap />}
        variant="ghost"
        size="md"
        onClick={() =>
          setView(view === "neighborhoods" ? "points" : "neighborhoods")
        }
      />
    ) : undefined;

  const showPoints = !territoryEnabled || view === "points";
  const showNeighborhoods = territoryEnabled && view === "neighborhoods";

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <NavContainer title="Leaderboard" right={viewToggle}>
      {showPoints && (
        <Box
          height={{ base: 280, md: 400 }}
          p={4}
          mb={4}
          bg="white"
          boxShadow="sm"
          borderRadius="lg"
        >
          <ResponsiveLine
            data={pointData}
            margin={{ top: 40, right: 20, bottom: 60, left: 50 }}
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
              legendOffset: 48,
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
          />
        </Box>
      )}

      {showPoints && territoryEnabled && (
        <Alert status="info" borderRadius="md" mb={4} variant="subtle" py={2}>
          <AlertIcon />
          <Text fontSize="sm">
            Points are just for fun — neighborhood control decides the winner.
            Points only break ties.
          </Text>
        </Alert>
      )}

      {showNeighborhoods && (
        <>
          <Box
            height={{ base: 280, md: 400 }}
            p={4}
            mb={4}
            bg="white"
            boxShadow="sm"
            borderRadius="lg"
          >
            <ResponsiveLine
              data={claimChartData}
              margin={{ top: 40, right: 20, bottom: 60, left: 50 }}
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
                max: Math.max(3, maxHeld + 1),
                stacked: false,
                reverse: false,
              }}
              yFormat=" >-.0f"
              axisTop={null}
              axisRight={null}
              axisBottom={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 90,
                format: "%H:%M",
                legend: "Time",
                legendOffset: 48,
                legendPosition: "middle",
              }}
              axisLeft={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
                legend: "Neighborhoods held",
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
            />
          </Box>
          <Heading size="md" mb={1} color="gray.800">
            Neighborhoods
          </Heading>
          <Text fontSize="sm" color="gray.600" mb={3}>
            Ranked by neighborhoods held, then points earned.
          </Text>
          <Podium items={territoryPodium} />
          <LeaderboardTable
            rows={territoryRows.map((row, index) => ({
              id: row.teamId,
              rank: index + 1,
              emoji: row.teamEmoji,
              name: row.teamName,
              color: row.teamColor,
              members: row.members,
              claimedNeighborhoods: row.claimedNeighborhoods,
              primary: String(row.neighborhoodsHeld),
              secondary:
                row.neighborhoodsHeld > 0 || row.totalDeposited > 0
                  ? `${row.totalDeposited} pts`
                  : `${row.bankPts} in bank`,
            }))}
            primaryHeader="Held"
            secondaryHeader="Deposited"
            expandedId={expandedId}
            onToggle={toggleExpand}
            showNeighborhoods
          />
        </>
      )}

      {showPoints && (
        <>
          <Heading size="md" mb={1} color="gray.800">
            Points
          </Heading>
          <Text fontSize="sm" color="gray.600" mb={3}>
            Score = points earned − points deposited into neighborhoods
            {territoryEnabled ? " (tiebreaker only)." : "."}
          </Text>
          <Podium items={pointsPodium} />
          <LeaderboardTable
            rows={teamsSortedbyPts.map((t, index) => ({
              id: t.id,
              rank: index + 1,
              emoji: t.emoji,
              name: t.name,
              color: t.color || "gray.300",
              members: t.members,
              claimedNeighborhoods: t.claimedNeighborhoods,
              primary: String(t.pts),
              secondary:
                t.deposited > 0
                  ? `earned ${t.earned} · spent ${t.deposited}`
                  : undefined,
            }))}
            primaryHeader="Score"
            secondaryHeader="Breakdown"
            expandedId={expandedId}
            onToggle={toggleExpand}
            showNeighborhoods={territoryEnabled}
          />
        </>
      )}
    </NavContainer>
  );
}

function LeaderboardTable({
  rows,
  primaryHeader,
  secondaryHeader,
  expandedId,
  onToggle,
  showNeighborhoods,
}: {
  rows: Array<{
    id: string;
    rank: number;
    emoji: string;
    name: string;
    color: string;
    members: TeamMember[];
    claimedNeighborhoods: ClaimedNeighborhood[];
    primary: string;
    secondary?: string;
  }>;
  primaryHeader: string;
  secondaryHeader: string;
  expandedId: string | null;
  onToggle: (id: string) => void;
  showNeighborhoods: boolean;
}) {
  return (
    <Box
      bg="white"
      borderRadius="lg"
      boxShadow="sm"
      overflowX="auto"
      mb={8}
    >
      <Table size="md" variant="simple">
        <Thead>
          <Tr>
            <Th w="40px">#</Th>
            <Th>Team</Th>
            <Th isNumeric whiteSpace="nowrap">
              {primaryHeader}
            </Th>
            <Th
              isNumeric
              whiteSpace="nowrap"
              display={{ base: "none", md: "table-cell" }}
            >
              {secondaryHeader}
            </Th>
            <Th w="36px" px={1} />
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((row) => {
            const open = expandedId === row.id;
            return (
              <Fragment key={row.id}>
                <Tr
                  cursor="pointer"
                  onClick={() => onToggle(row.id)}
                  _hover={{ bg: "gray.50" }}
                  bg={open ? "gray.50" : undefined}
                >
                  <Td color="gray.500" fontWeight="semibold" verticalAlign="top">
                    {row.rank}
                  </Td>
                  <Td minW={0} verticalAlign="top">
                    <Flex
                      align="flex-start"
                      gap={2}
                      borderLeftWidth="3px"
                      borderLeftColor={row.color}
                      pl={3}
                    >
                      <Text fontSize="lg" lineHeight={1.2} flexShrink={0}>
                        {row.emoji}
                      </Text>
                      <Box minW={0}>
                        <Text fontWeight="semibold" wordBreak="break-word">
                          {row.name}
                        </Text>
                      </Box>
                    </Flex>
                  </Td>
                  <Td
                    isNumeric
                    whiteSpace="nowrap"
                    verticalAlign="top"
                    fontWeight="semibold"
                  >
                    {row.primary}
                  </Td>
                  <Td
                    isNumeric
                    whiteSpace="nowrap"
                    verticalAlign="top"
                    color="gray.600"
                    fontSize="sm"
                    display={{ base: "none", md: "table-cell" }}
                  >
                    {row.secondary ?? "—"}
                  </Td>
                  <Td px={1} verticalAlign="top">
                    <ChevronDownIcon
                      w={4}
                      h={4}
                      color="gray.400"
                      transform={open ? "rotate(180deg)" : undefined}
                      transition="transform 0.15s ease"
                    />
                  </Td>
                </Tr>
                <Tr>
                  <Td
                    colSpan={5}
                    p={0}
                    borderBottomWidth={open ? undefined : 0}
                  >
                    <Collapse in={open} animateOpacity>
                      <Box px={4} pb={3} pl={{ base: 12, md: 16 }}>
                        <DetailRows
                          members={row.members}
                          claimedNeighborhoods={row.claimedNeighborhoods}
                          showNeighborhoods={showNeighborhoods}
                        />
                      </Box>
                    </Collapse>
                  </Td>
                </Tr>
              </Fragment>
            );
          })}
        </Tbody>
      </Table>
    </Box>
  );
}
