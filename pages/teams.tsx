import { GetServerSidePropsContext } from "next";
import NavContainer from "../components/NavContainer";
import {
  Alert,
  AlertIcon,
  Box,
  Collapse,
  Flex,
  Heading,
  HStack,
  IconButton,
  RangeSlider,
  RangeSliderFilledTrack,
  RangeSliderThumb,
  RangeSliderTrack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from "@chakra-ui/react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { format, parseISO } from "date-fns";
import { useRouter } from "next/router";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { LuHistory, LuMap, LuTrophy } from "react-icons/lu";
import { requireUserSSP, requireHuntAccessSSP } from "../lib/auth";
import {
  getLeaderboardPayload,
  type ClaimedNeighborhood,
  type ClaimSeries,
  type LeaderboardPayload,
  type TeamMember,
} from "../lib/leaderboard";

/** Minimum zoom window on the leaderboard time slider. */
const MIN_VIEW_MS = 15 * 60 * 1000;

type ChartPoint = { x: Date; y: number };

type ChartSerie = {
  id: string;
  color: string;
  data: ChartPoint[];
};

/** Keep carry-forward value at window start so zoomed lines stay continuous. */
function windowSeries(
  data: ChartPoint[],
  viewStart: Date,
  viewEnd: Date,
): ChartPoint[] {
  const startMs = viewStart.getTime();
  const endMs = viewEnd.getTime();
  let yAtStart = data[0]?.y ?? 0;
  const inWindow: ChartPoint[] = [];
  for (const p of data) {
    const t = p.x.getTime();
    if (t <= startMs) yAtStart = p.y;
    else if (t <= endMs) inWindow.push(p);
  }
  return [{ x: viewStart, y: yAtStart }, ...inWindow];
}

/**
 * Nivo x-slices only include series that share an exact x. Align every series
 * onto the union of timestamps (carry-forward) so the tooltip lists all teams.
 */
function alignSeriesForSlices(series: ChartSerie[]): ChartSerie[] {
  const xs = new Set<number>();
  for (const s of series) {
    for (const p of s.data) xs.add(p.x.getTime());
  }
  const sortedXs = [...xs].sort((a, b) => a - b);
  if (sortedXs.length === 0) return series;

  return series.map((s) => {
    const points = [...s.data].sort(
      (a, b) => a.x.getTime() - b.x.getTime(),
    );
    let i = 0;
    let y = points[0]?.y ?? 0;
    const data: ChartPoint[] = [];
    for (const t of sortedXs) {
      while (i < points.length && points[i]!.x.getTime() <= t) {
        y = points[i]!.y;
        i += 1;
      }
      data.push({ x: new Date(t), y });
    }
    return { ...s, data };
  });
}

function formatChartTime(d: Date): string {
  return format(d, "EEE h:mm a");
}

function chartPointTimeMs(x: unknown): number {
  if (x instanceof Date) return x.getTime();
  if (typeof x === "number" || typeof x === "string") {
    const t = new Date(x).getTime();
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  }
  return Number.NEGATIVE_INFINITY;
}

type SlicePoint = {
  id: string | number;
  serieId: string | number;
  serieColor: string;
  data: {
    x?: unknown;
    xFormatted?: string | number;
    yFormatted?: string | number;
    y?: unknown;
  };
};

/**
 * Nivo x-slices group by *pixel* x, so nearby event times collapse into one
 * slice and the same team can appear twice (pre- and post-change). Keep one
 * row per series at the latest data time in the slice.
 */
function dedupeSlicePointsBySeries(
  points: ReadonlyArray<SlicePoint>,
): SlicePoint[] {
  const bySeries = new Map<string, SlicePoint>();
  for (const p of points) {
    const key = String(p.serieId);
    const prev = bySeries.get(key);
    if (!prev || chartPointTimeMs(p.data.x) >= chartPointTimeMs(prev.data.x)) {
      bySeries.set(key, p);
    }
  }
  return [...bySeries.values()];
}

function LeaderboardSliceTooltip({
  slice,
}: {
  slice: {
    points: ReadonlyArray<SlicePoint>;
  };
}) {
  const points = dedupeSlicePointsBySeries(slice.points).sort((a, b) => {
    const ay = typeof a.data.y === "number" ? a.data.y : Number(a.data.y);
    const by = typeof b.data.y === "number" ? b.data.y : Number(b.data.y);
    return (Number.isFinite(by) ? by : 0) - (Number.isFinite(ay) ? ay : 0);
  });
  let latestMs = Number.NEGATIVE_INFINITY;
  let whenDate: Date | null = null;
  for (const p of points) {
    const ms = chartPointTimeMs(p.data.x);
    if (ms > latestMs) {
      latestMs = ms;
      whenDate = new Date(ms);
    }
  }
  const whenLabel =
    whenDate != null && !Number.isNaN(whenDate.getTime())
      ? formatChartTime(whenDate)
      : points[0]?.data.xFormatted != null
        ? String(points[0].data.xFormatted)
        : null;

  return (
    <Box
      bg="white"
      px={3}
      py={2}
      borderRadius="md"
      boxShadow="lg"
      border="1px solid"
      borderColor="gray.200"
      maxH="min(50vh, 320px)"
      overflowY="auto"
      minW="180px"
    >
      {whenLabel != null && (
        <Text fontSize="xs" fontWeight="semibold" color="gray.600" mb={1.5}>
          {whenLabel}
        </Text>
      )}
      <VStack align="stretch" spacing={0.5}>
        {points.map((p) => (
          <HStack key={String(p.serieId)} spacing={2} justify="space-between">
            <HStack spacing={1.5} minW={0}>
              <Box
                w="8px"
                h="8px"
                borderRadius="full"
                bg={p.serieColor}
                flexShrink={0}
              />
              <Text fontSize="xs" noOfLines={1}>
                {String(p.serieId)}
              </Text>
            </HStack>
            <Text fontSize="xs" fontWeight="semibold" flexShrink={0}>
              {String(p.data.yFormatted ?? p.data.y ?? "")}
            </Text>
          </HStack>
        ))}
      </VStack>
    </Box>
  );
}

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

  const huntRedirect = await requireHuntAccessSSP(auth.user);
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
  bankPts,
  earned,
}: {
  members: TeamMember[];
  claimedNeighborhoods: ClaimedNeighborhood[];
  showNeighborhoods: boolean;
  /** Spendable bank — neighborhoods board expand only. */
  bankPts?: number;
  /** All-time challenge points earned — neighborhoods board expand only. */
  earned?: number;
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
      {bankPts != null && earned != null && (
        <>
          <Text fontSize="sm" color="gray.500" lineHeight="short" mt={1}>
            <Text as="span" fontWeight="medium" color="gray.600">
              Spendable:{" "}
            </Text>
            {bankPts}
          </Text>
          <Text fontSize="sm" color="gray.500" lineHeight="short" mt={1}>
            <Text as="span" fontWeight="medium" color="gray.600">
              All-time earned:{" "}
            </Text>
            {earned}
          </Text>
        </>
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

  const maxDate =
    new Date() < startTime
      ? startTime
      : new Date() > endTime
        ? endTime
        : new Date();

  const huntStartMs = startTime.getTime();
  const huntEndMs = maxDate.getTime();
  const huntSpanMs = Math.max(0, huntEndMs - huntStartMs);

  /** Offset range [fromStart, toStart] within the hunt window. */
  const [viewOffsets, setViewOffsets] = useState<[number, number]>([
    0,
    huntSpanMs,
  ]);

  useEffect(() => {
    setViewOffsets((prev) => {
      // Keep full-window default when the hunt span first becomes known / changes size.
      if (prev[0] === 0 && (prev[1] === 0 || prev[1] >= huntSpanMs)) {
        return [0, huntSpanMs];
      }
      const a = Math.max(0, Math.min(prev[0], huntSpanMs));
      const b = Math.max(a, Math.min(prev[1], huntSpanMs));
      return [a, b];
    });
  }, [huntSpanMs]);

  const viewStartMs = huntStartMs + Math.min(viewOffsets[0], huntSpanMs);
  const viewEndMs = huntStartMs + Math.max(
    Math.min(viewOffsets[1], huntSpanMs),
    Math.min(viewOffsets[0], huntSpanMs) + Math.min(MIN_VIEW_MS, huntSpanMs),
  );
  const viewStart = useMemo(() => new Date(viewStartMs), [viewStartMs]);
  const viewEnd = useMemo(() => new Date(viewEndMs), [viewEndMs]);

  const teamColorById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teamsSortedbyPts) {
      if (t.color) m.set(t.id, t.color);
    }
    for (const r of territoryRows) {
      if (r.teamColor) m.set(r.teamId, r.teamColor);
    }
    return m;
  }, [teamsSortedbyPts, territoryRows]);

  const pointData = useMemo(
    () =>
      alignSeriesForSlices(
        teamsSortedbyPts.map((t) => {
          const data: ChartPoint[] = [{ x: startTime, y: 0 }];
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
          return {
            id: `${t.emoji} ${t.name}`,
            color: t.color || "#718096",
            data: windowSeries(data, viewStart, viewEnd),
          };
        }),
      ),
    [teamsSortedbyPts, startTime, viewStart, viewEnd],
  );

  const claimChartData = useMemo(
    () =>
      alignSeriesForSlices(
        claimSeries.map((s) => ({
          id: s.id,
          color: teamColorById.get(s.teamId) || "#718096",
          data: windowSeries(
            s.data.map((p) => ({ x: new Date(p.x), y: p.y })),
            viewStart,
            viewEnd,
          ),
        })),
      ),
    [claimSeries, teamColorById, viewStart, viewEnd],
  );

  const maxEarned = useMemo(() => {
    let max = 0;
    for (const series of pointData) {
      for (const p of series.data) max = Math.max(max, p.y);
    }
    return max;
  }, [pointData]);

  // Historical claim series can peak above the current leaderboard after
  // deposits are corrected/archived. Scale the graph to its full history.
  const maxHistoricalHeld = claimChartData.reduce(
    (max, series) =>
      series.data.reduce((seriesMax, point) => Math.max(seriesMax, point.y), max),
    0,
  );
  const heldYMax = Math.max(3, maxHistoricalHeld + 1);
  const heldTickValues = Array.from({ length: heldYMax + 1 }, (_, i) => i);

  const timeRangeSlider =
    huntSpanMs > 0 ? (
      <Box px={1} pt={1} pb={2}>
        <HStack justify="space-between" mb={1}>
          <Text fontSize="xs" color="gray.600">
            {formatChartTime(viewStart)}
          </Text>
          <Text fontSize="xs" color="gray.500">
            Zoom time range
          </Text>
          <Text fontSize="xs" color="gray.600">
            {formatChartTime(viewEnd)}
          </Text>
        </HStack>
        <RangeSlider
          aria-label={["Chart start", "Chart end"]}
          min={0}
          max={huntSpanMs}
          step={Math.max(60_000, Math.floor(huntSpanMs / 500))}
          value={[
            Math.min(viewOffsets[0], huntSpanMs),
            Math.min(viewOffsets[1], huntSpanMs),
          ]}
          minStepsBetweenThumbs={Math.max(
            1,
            Math.ceil(MIN_VIEW_MS / Math.max(60_000, Math.floor(huntSpanMs / 500))),
          )}
          onChange={(next) => {
            let [a, b] = next as [number, number];
            if (b - a < MIN_VIEW_MS) {
              // Keep a minimum window; prefer moving the thumb that changed.
              if (a !== viewOffsets[0]) a = Math.max(0, b - MIN_VIEW_MS);
              else b = Math.min(huntSpanMs, a + MIN_VIEW_MS);
            }
            setViewOffsets([a, b]);
          }}
          focusThumbOnChange={false}
        >
          <RangeSliderTrack>
            <RangeSliderFilledTrack bg="blue.400" />
          </RangeSliderTrack>
          <RangeSliderThumb index={0} />
          <RangeSliderThumb index={1} />
        </RangeSlider>
      </Box>
    ) : null;

  const pointsPodium = useMemo(
    () =>
      teamsSortedbyPts.slice(0, 3).map((t) => ({
        id: t.id,
        label: t.name,
        emoji: t.emoji,
        color: t.color,
        primary: `${t.earned} pts`,
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
        variant="outline"
        size="md"
        onClick={() =>
          setView(view === "neighborhoods" ? "points" : "neighborhoods")
        }
      />
    ) : null;

  const headerRight = (
    <HStack spacing={2}>
      <IconButton
        aria-label="Open map replay"
        icon={<LuHistory />}
        variant="outline"
        size="md"
        onClick={() =>
          void router.push({
            pathname: "/challenges",
            query: { view: "map", replay: "1" },
          })
        }
      />
      {viewToggle}
    </HStack>
  );

  const showPoints = !territoryEnabled || view === "points";
  const showNeighborhoods = territoryEnabled && view === "neighborhoods";

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <NavContainer title="Leaderboard" right={headerRight}>
      {showPoints && (
        <Box
          p={4}
          mb={4}
          bg="white"
          boxShadow="sm"
          borderRadius="lg"
        >
          <Box height={{ base: 280, md: 400 }}>
            <ResponsiveLine
              data={pointData}
              margin={{ top: 40, right: 20, bottom: 60, left: 50 }}
              xScale={{
                format: "%Y-%m-%d, %H:%M:%S",
                type: "time",
                precision: "minute",
                min: viewStart,
                max: viewEnd,
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
              colors={{ datum: "color" }}
              pointLabel="data.yFormatted"
              pointLabelYOffset={-12}
              enableTouchCrosshair={true}
              enableSlices="x"
              sliceTooltip={LeaderboardSliceTooltip}
              useMesh={false}
            />
          </Box>
          {timeRangeSlider}
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
          <Box p={4} mb={4} bg="white" boxShadow="sm" borderRadius="lg">
            <Box height={{ base: 280, md: 400 }}>
              <ResponsiveLine
                data={claimChartData}
                margin={{ top: 40, right: 20, bottom: 60, left: 50 }}
                xScale={{
                  format: "%Y-%m-%d, %H:%M:%S",
                  type: "time",
                  precision: "minute",
                  min: viewStart,
                  max: viewEnd,
                  useUTC: true,
                }}
                xFormat="time:%Y-%m-%d %H:%M:%S"
                yScale={{
                  type: "linear",
                  min: 0,
                  max: heldYMax,
                  nice: false,
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
                  tickValues: heldTickValues,
                }}
                pointSize={0}
                colors={{ datum: "color" }}
                pointLabel="data.yFormatted"
                pointLabelYOffset={-12}
                enableTouchCrosshair={true}
                enableSlices="x"
                sliceTooltip={LeaderboardSliceTooltip}
                useMesh={false}
              />
            </Box>
            {timeRangeSlider}
          </Box>
          <Heading size="md" mb={1} color="gray.800">
            Neighborhoods
          </Heading>
          <Text fontSize="sm" color="gray.600" mb={3}>
            Ranked by neighborhoods held, then points earned. Expand a row for
            spendable and all-time points.
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
              bankPts: row.bankPts,
              earned: row.earned,
            }))}
            primaryHeader="Held"
            expandedId={expandedId}
            onToggle={toggleExpand}
            showNeighborhoods
            showPointBreakdown
          />
        </>
      )}

      {showPoints && (
        <>
          <Heading size="md" mb={1} color="gray.800">
            Points
          </Heading>
          <Text fontSize="sm" color="gray.600" mb={3}>
            Total points earned from accepted challenges
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
              primary: String(t.earned),
            }))}
            primaryHeader="Pts"
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
  expandedId,
  onToggle,
  showNeighborhoods,
  showPointBreakdown = false,
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
    bankPts?: number;
    earned?: number;
  }>;
  primaryHeader: string;
  expandedId: string | null;
  onToggle: (id: string) => void;
  showNeighborhoods: boolean;
  /** Neighborhoods board: show spendable + all-time in the expand panel. */
  showPointBreakdown?: boolean;
}) {
  const colCount = 4;
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
                    colSpan={colCount}
                    p={0}
                    borderBottomWidth={open ? undefined : 0}
                  >
                    <Collapse in={open} animateOpacity>
                      <Box px={4} pb={3} pl={{ base: 12, md: 16 }}>
                        <DetailRows
                          members={row.members}
                          claimedNeighborhoods={row.claimedNeighborhoods}
                          showNeighborhoods={showNeighborhoods}
                          bankPts={
                            showPointBreakdown ? row.bankPts : undefined
                          }
                          earned={showPointBreakdown ? row.earned : undefined}
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
