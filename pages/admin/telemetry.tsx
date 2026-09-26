import { useMemo, useState, useCallback, type ReactNode } from "react";
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import useSWR from "swr";
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Code,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Spinner,
  Stat,
  StatHelpText,
  StatLabel,
  StatNumber,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import NavContainer from "../../components/NavContainer";
import AdminDataTable, {
  type AdminColumn,
} from "../../components/AdminDataTable";
import { publicUser, requireAdminSSP } from "../../lib/auth";
import type {
  TelemetryEventRow,
  TelemetryEventsResult,
  TelemetryRange,
  TelemetrySummary,
} from "../../lib/telemetryQueries";

const ResponsiveLine = dynamic(
  () => import("@nivo/line").then((m) => m.ResponsiveLine),
  { ssr: false },
);

type TeamOption = { id: string; name: string; emoji: string };

const EVENT_TYPES = [
  "",
  "file_selected",
  "compress_start",
  "compress_done",
  "compress_skipped",
  "compress_failed",
  "poster_done",
  "poster_failed",
  "upload_start",
  "upload_part_retry",
  "upload_stalled",
  "upload_done",
  "upload_failed",
  "submit_done",
  "submit_failed",
  "online",
  "offline",
  "multipart_completed",
  "multipart_aborted",
  "multipart_list_parts",
  "submission_created",
  "submission_media_updated",
  "validation_failed",
  "feed_page_loaded",
  "video_first_frame",
  "video_stall",
  "video_error",
  "web_vital",
] as const;

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body?.error === "string" ? body.error : `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${bytes} B`;
  if (abs < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (abs < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (Math.abs(ms) < 1000) return `${Math.round(ms)} ms`;
  if (Math.abs(ms) < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

function formatPct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function levelColor(level: string): string {
  if (level === "error") return "red";
  if (level === "warn") return "orange";
  return "gray";
}

function buildQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireAdminSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };
  return {
    props: {
      user: publicUser(auth.user!),
    },
  };
};

function StatCard({
  label,
  value,
  help,
}: {
  label: string;
  value: ReactNode;
  help?: ReactNode;
}) {
  return (
    <Box bg="white" borderRadius="md" boxShadow="sm" p={4} minW={0}>
      <Stat>
        <StatLabel fontSize="xs" color="gray.500" noOfLines={1}>
          {label}
        </StatLabel>
        <StatNumber fontSize={{ base: "lg", md: "xl" }}>{value}</StatNumber>
        {help ? <StatHelpText mb={0}>{help}</StatHelpText> : null}
      </Stat>
    </Box>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box
      bg="white"
      borderRadius="md"
      boxShadow="sm"
      p={4}
      height={{ base: 280, md: 340 }}
      minW={0}
    >
      <Text fontSize="sm" fontWeight="semibold" mb={2}>
        {title}
      </Text>
      <Box height="calc(100% - 28px)">{children}</Box>
    </Box>
  );
}

export default function AdminTelemetryPage({
  user: _user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [range, setRange] = useState<TelemetryRange>("24h");
  const [includeSandbox, setIncludeSandbox] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [teamId, setTeamId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(
    null,
  );
  const { isOpen, onOpen, onClose } = useDisclosure();

  const commonParams = useMemo(
    () => ({
      range,
      includeSandbox: includeSandbox ? "1" : undefined,
    }),
    [range, includeSandbox],
  );

  const summaryUrl = `/api/admin/telemetry/summary${buildQuery(commonParams)}`;
  const eventsUrl = `/api/admin/telemetry/events${buildQuery({
    ...commonParams,
    type: typeFilter || undefined,
    level: levelFilter || undefined,
    teamId: teamId || undefined,
    q: userSearch.trim() || undefined,
    limit: "150",
  })}`;

  const {
    data: summary,
    error: summaryError,
    isLoading: summaryLoading,
  } = useSWR<TelemetrySummary>(summaryUrl, jsonFetcher, {
    refreshInterval: 15_000,
  });

  const {
    data: eventsData,
    error: eventsError,
    isLoading: eventsLoading,
  } = useSWR<TelemetryEventsResult>(eventsUrl, jsonFetcher, {
    refreshInterval: 15_000,
  });

  const { data: teamsData } = useSWR<{ teams: TeamOption[] }>(
    "/api/admin/teams",
    jsonFetcher,
    { revalidateOnFocus: false },
  );

  const attemptUrl = selectedAttemptId
    ? `/api/admin/telemetry/events${buildQuery({
        attemptId: selectedAttemptId,
        includeSandbox: "1",
        since: "1970-01-01T00:00:00.000Z",
        limit: "500",
      })}`
    : null;

  const { data: attemptData, isLoading: attemptLoading } =
    useSWR<TelemetryEventsResult>(attemptUrl, jsonFetcher);

  const openAttempt = useCallback(
    (attemptId: string) => {
      setSelectedAttemptId(attemptId);
      onOpen();
    },
    [onOpen],
  );

  const closeDrawer = () => {
    onClose();
    setSelectedAttemptId(null);
  };

  const cards = summary?.cards;
  const volumeSeries = useMemo(() => {
    const rows = summary?.timeseries ?? [];
    return [
      {
        id: "started",
        data: rows.map((b) => ({ x: new Date(b.bucket), y: b.started })),
      },
      {
        id: "done",
        data: rows.map((b) => ({ x: new Date(b.bucket), y: b.done })),
      },
      {
        id: "failed",
        data: rows.map((b) => ({ x: new Date(b.bucket), y: b.failed })),
      },
    ];
  }, [summary?.timeseries]);

  const latencySeries = useMemo(() => {
    const rows = summary?.timeseries ?? [];
    return [
      {
        id: "upload p50",
        data: rows
          .filter((b) => b.uploadP50Ms != null)
          .map((b) => ({
            x: new Date(b.bucket),
            y: (b.uploadP50Ms ?? 0) / 1000,
          })),
      },
      {
        id: "upload p90",
        data: rows
          .filter((b) => b.uploadP90Ms != null)
          .map((b) => ({
            x: new Date(b.bucket),
            y: (b.uploadP90Ms ?? 0) / 1000,
          })),
      },
      {
        id: "first-frame p50",
        data: rows
          .filter((b) => b.firstFrameP50Ms != null)
          .map((b) => ({
            x: new Date(b.bucket),
            y: (b.firstFrameP50Ms ?? 0) / 1000,
          })),
      },
    ];
  }, [summary?.timeseries]);

  const eventColumns: AdminColumn<TelemetryEventRow>[] = useMemo(
    () => [
      {
        id: "time",
        header: "Time",
        getSortValue: (r) => r.createdAt,
        cell: (r) => (
          <Text fontSize="xs" whiteSpace="nowrap">
            {formatTime(r.createdAt)}
          </Text>
        ),
      },
      {
        id: "level",
        header: "Level",
        getSortValue: (r) => r.level,
        cell: (r) => (
          <Badge colorScheme={levelColor(r.level)} fontSize="0.65rem">
            {r.level}
          </Badge>
        ),
      },
      {
        id: "type",
        header: "Type",
        getSortValue: (r) => r.type,
        cell: (r) => (
          <Text fontSize="sm" fontFamily="mono">
            {r.type}
          </Text>
        ),
      },
      {
        id: "team",
        header: "Team",
        getSortValue: (r) => r.teamName ?? "",
        getFilterValue: (r) => `${r.teamEmoji ?? ""} ${r.teamName ?? ""}`,
        cell: (r) =>
          r.teamName ? (
            <Text fontSize="sm" noOfLines={1}>
              {r.teamEmoji ? `${r.teamEmoji} ` : ""}
              {r.teamName}
            </Text>
          ) : (
            <Text color="gray.400">—</Text>
          ),
      },
      {
        id: "user",
        header: "User",
        getSortValue: (r) => r.userName ?? "",
        cell: (r) => (
          <Text fontSize="sm" noOfLines={1}>
            {r.userName ?? "—"}
          </Text>
        ),
      },
      {
        id: "size",
        header: "Size",
        getSortValue: (r) => r.bytes ?? -1,
        cell: (r) => (
          <Text fontSize="xs" whiteSpace="nowrap">
            {formatBytes(r.bytes)}
          </Text>
        ),
      },
      {
        id: "duration",
        header: "Duration",
        getSortValue: (r) => r.durationMs ?? -1,
        cell: (r) => (
          <Text fontSize="xs" whiteSpace="nowrap">
            {formatDuration(r.durationMs)}
          </Text>
        ),
      },
      {
        id: "error",
        header: "Error",
        getSortValue: (r) => r.errorCode ?? r.errorMessage ?? "",
        getFilterValue: (r) =>
          `${r.errorCode ?? ""} ${r.errorMessage ?? ""}`,
        cell: (r) =>
          r.errorCode || r.errorMessage ? (
            <Text fontSize="xs" noOfLines={1} maxW="180px" title={r.errorMessage ?? undefined}>
              {r.errorCode ?? r.errorMessage}
            </Text>
          ) : (
            <Text color="gray.400">—</Text>
          ),
        defaultVisible: true,
      },
      {
        id: "attempt",
        header: "Attempt",
        getSortValue: (r) => r.attemptId ?? "",
        cell: (r) =>
          r.attemptId ? (
            <Text fontSize="xs" fontFamily="mono" noOfLines={1} maxW="90px">
              {r.attemptId.slice(0, 8)}
            </Text>
          ) : (
            <Text color="gray.400">—</Text>
          ),
      },
    ],
    [],
  );

  const attemptEvents = attemptData?.events ?? [];
  const attemptStartMs =
    attemptEvents.length > 0
      ? new Date(attemptEvents[0]!.createdAt).getTime()
      : 0;
  const submissionId =
    attemptEvents.find((e) => e.submissionId)?.submissionId ?? null;

  const chartTheme = {
    axis: {
      ticks: { text: { fontSize: 10, fill: "#718096" } },
      legend: { text: { fontSize: 11, fill: "#4A5568" } },
    },
    legends: { text: { fontSize: 11 } },
  };

  return (
    <NavContainer title="Telemetry">
      <VStack align="stretch" spacing={5} width="100%">
        <Flex
          justify="space-between"
          align={{ base: "stretch", md: "center" }}
          gap={3}
          flexDir={{ base: "column", md: "row" }}
          flexWrap="wrap"
        >
          <HStack spacing={3} flexWrap="wrap">
            <Heading size="lg">Telemetry</Heading>
            <Button as={Link} href="/admin" size="sm" variant="outline">
              ← Admin
            </Button>
          </HStack>
          <HStack spacing={3} flexWrap="wrap" align="center">
            <ButtonGroup size="sm" isAttached variant="outline">
              {(["1h", "6h", "24h", "hunt"] as TelemetryRange[]).map((r) => (
                <Button
                  key={r}
                  onClick={() => setRange(r)}
                  colorScheme={range === r ? "blue" : undefined}
                  variant={range === r ? "solid" : "outline"}
                >
                  {r}
                </Button>
              ))}
            </ButtonGroup>
            <FormControl display="flex" alignItems="center" w="auto">
              <FormLabel htmlFor="sandbox-toggle" mb={0} fontSize="sm" mr={2}>
                Include sandbox
              </FormLabel>
              <Switch
                id="sandbox-toggle"
                isChecked={includeSandbox}
                onChange={(e) => setIncludeSandbox(e.target.checked)}
              />
            </FormControl>
          </HStack>
        </Flex>

        {summaryError ? (
          <Text color="red.500" fontSize="sm">
            Failed to load summary: {summaryError.message}
          </Text>
        ) : null}

        {summaryLoading && !summary ? (
          <HStack>
            <Spinner size="sm" />
            <Text fontSize="sm" color="gray.500">
              Loading summary…
            </Text>
          </HStack>
        ) : null}

        <SimpleGrid columns={{ base: 2, md: 3, lg: 4, xl: 6 }} spacing={3}>
          <StatCard
            label="Uploads started"
            value={cards?.uploadsStarted ?? "—"}
          />
          <StatCard
            label="Success rate"
            value={formatPct(cards?.successRate)}
            help={
              cards
                ? `${cards.uploadsDone} done / ${cards.uploadsFailed} failed`
                : undefined
            }
          />
          <StatCard
            label="Upload p50 / p90"
            value={`${formatDuration(cards?.uploadP50Ms)} / ${formatDuration(cards?.uploadP90Ms)}`}
          />
          <StatCard
            label="Bytes saved"
            value={formatBytes(cards?.bytesSaved)}
            help={`Compression used ${formatPct(cards?.compressionUsedRate)}`}
          />
          <StatCard
            label="First frame p50 / p90"
            value={`${formatDuration(cards?.firstFrameP50Ms)} / ${formatDuration(cards?.firstFrameP90Ms)}`}
            help={cards ? `${cards.stallCount} stalls` : undefined}
          />
          <StatCard label="LCP p75" value={formatDuration(cards?.lcpP75Ms)} />
        </SimpleGrid>

        <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
          <ChartCard
            title={`Uploads per ${summary?.bucketMinutes ?? "—"} min`}
          >
            {volumeSeries.every((s) => s.data.length === 0) ? (
              <Flex h="100%" align="center" justify="center">
                <Text color="gray.400" fontSize="sm">
                  No upload activity in range
                </Text>
              </Flex>
            ) : (
              <ResponsiveLine
                data={volumeSeries}
                margin={{ top: 10, right: 20, bottom: 50, left: 45 }}
                xScale={{ type: "time", precision: "minute" }}
                xFormat="time:%H:%M"
                yScale={{ type: "linear", min: 0, stacked: false }}
                axisBottom={{
                  format: "%H:%M",
                  tickRotation: -45,
                  legend: "Time",
                  legendOffset: 40,
                  legendPosition: "middle",
                }}
                axisLeft={{
                  legend: "Count",
                  legendOffset: -38,
                  legendPosition: "middle",
                }}
                colors={{ scheme: "set2" }}
                enablePoints={false}
                enableSlices="x"
                useMesh
                theme={chartTheme}
                legends={[
                  {
                    anchor: "bottom",
                    direction: "row",
                    translateY: 46,
                    itemWidth: 70,
                    itemHeight: 14,
                    symbolSize: 8,
                    symbolShape: "circle",
                  },
                ]}
              />
            )}
          </ChartCard>

          <ChartCard title="Latency (seconds)">
            {latencySeries.every((s) => s.data.length === 0) ? (
              <Flex h="100%" align="center" justify="center">
                <Text color="gray.400" fontSize="sm">
                  No latency samples in range
                </Text>
              </Flex>
            ) : (
              <ResponsiveLine
                data={latencySeries}
                margin={{ top: 10, right: 20, bottom: 50, left: 45 }}
                xScale={{ type: "time", precision: "minute" }}
                xFormat="time:%H:%M"
                yScale={{ type: "linear", min: 0, stacked: false }}
                axisBottom={{
                  format: "%H:%M",
                  tickRotation: -45,
                  legend: "Time",
                  legendOffset: 40,
                  legendPosition: "middle",
                }}
                axisLeft={{
                  legend: "Seconds",
                  legendOffset: -38,
                  legendPosition: "middle",
                }}
                colors={{ scheme: "category10" }}
                enablePoints={false}
                enableSlices="x"
                useMesh
                theme={chartTheme}
                legends={[
                  {
                    anchor: "bottom",
                    direction: "row",
                    translateY: 46,
                    itemWidth: 100,
                    itemHeight: 14,
                    symbolSize: 8,
                    symbolShape: "circle",
                  },
                ]}
              />
            )}
          </ChartCard>
        </SimpleGrid>

        <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
          <Box bg="white" borderRadius="md" boxShadow="sm" p={4} overflowX="auto">
            <Text fontSize="sm" fontWeight="semibold" mb={3}>
              By device
            </Text>
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>Platform</Th>
                  <Th>Browser</Th>
                  <Th isNumeric>Uploads</Th>
                  <Th isNumeric>Success</Th>
                  <Th isNumeric>Compress</Th>
                </Tr>
              </Thead>
              <Tbody>
                {(summary?.byDevice ?? []).length === 0 ? (
                  <Tr>
                    <Td colSpan={5}>
                      <Text color="gray.400" textAlign="center" py={3}>
                        No device data
                      </Text>
                    </Td>
                  </Tr>
                ) : (
                  summary!.byDevice.map((row) => (
                    <Tr key={`${row.platform}:${row.browser}`}>
                      <Td>{row.platform}</Td>
                      <Td>{row.browser}</Td>
                      <Td isNumeric>{row.uploads}</Td>
                      <Td isNumeric>{formatPct(row.successRate)}</Td>
                      <Td isNumeric>{formatPct(row.compressionRate)}</Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </Box>

          <Box bg="white" borderRadius="md" boxShadow="sm" p={4} overflowX="auto">
            <Text fontSize="sm" fontWeight="semibold" mb={3}>
              Top failures
            </Text>
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>Type</Th>
                  <Th>Code</Th>
                  <Th isNumeric>Count</Th>
                  <Th>Sample</Th>
                </Tr>
              </Thead>
              <Tbody>
                {(summary?.topFailures ?? []).length === 0 ? (
                  <Tr>
                    <Td colSpan={4}>
                      <Text color="gray.400" textAlign="center" py={3}>
                        No failures in range
                      </Text>
                    </Td>
                  </Tr>
                ) : (
                  summary!.topFailures.map((row) => (
                    <Tr key={`${row.type}:${row.errorCode ?? ""}`}>
                      <Td>
                        <Text fontFamily="mono" fontSize="xs">
                          {row.type}
                        </Text>
                      </Td>
                      <Td>{row.errorCode ?? "—"}</Td>
                      <Td isNumeric>{row.count}</Td>
                      <Td maxW="220px">
                        <Text fontSize="xs" noOfLines={2} title={row.sampleMessage ?? undefined}>
                          {row.sampleMessage ?? "—"}
                        </Text>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </Box>
        </SimpleGrid>

        <Box>
          <Heading size="md" mb={3}>
            Live event log
          </Heading>
          <SimpleGrid
            columns={{ base: 1, sm: 2, md: 4 }}
            spacing={3}
            mb={3}
          >
            <FormControl>
              <FormLabel fontSize="xs" mb={1}>
                Type
              </FormLabel>
              <Select
                size="sm"
                bg="white"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All types</option>
                {EVENT_TYPES.filter(Boolean).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs" mb={1}>
                Level
              </FormLabel>
              <Select
                size="sm"
                bg="white"
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
              >
                <option value="">All levels</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs" mb={1}>
                Team
              </FormLabel>
              <Select
                size="sm"
                bg="white"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">All teams</option>
                {(teamsData?.teams ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.emoji} {t.name}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs" mb={1}>
                Search
              </FormLabel>
              <Input
                size="sm"
                bg="white"
                placeholder="type or error message…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </FormControl>
          </SimpleGrid>

          {eventsError ? (
            <Text color="red.500" fontSize="sm" mb={2}>
              Failed to load events: {eventsError.message}
            </Text>
          ) : null}

          {eventsLoading && !eventsData ? (
            <HStack mb={2}>
              <Spinner size="sm" />
              <Text fontSize="sm" color="gray.500">
                Loading events…
              </Text>
            </HStack>
          ) : null}

          <AdminDataTable
            tableId="admin-telemetry-events"
            rows={eventsData?.events ?? []}
            columns={eventColumns}
            getRowId={(r) => r.id}
            emptyMessage="No events in range"
            onRowClick={(row) => {
              if (row.attemptId) openAttempt(row.attemptId);
            }}
          />
          <Text fontSize="xs" color="gray.500" mt={2}>
            Click a row with an attempt id to open its timeline. Auto-refreshes
            every 15s.
          </Text>
        </Box>
      </VStack>

      <Drawer isOpen={isOpen} placement="right" onClose={closeDrawer} size="md">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader borderBottomWidth="1px">
            <VStack align="stretch" spacing={1}>
              <Text fontSize="md">Attempt timeline</Text>
              {selectedAttemptId ? (
                <Code fontSize="xs" wordBreak="break-all">
                  {selectedAttemptId}
                </Code>
              ) : null}
              {submissionId ? (
                <Button
                  as={Link}
                  href={`/feed?submission=${submissionId}`}
                  size="xs"
                  variant="link"
                  colorScheme="blue"
                  alignSelf="flex-start"
                >
                  Open in feed →
                </Button>
              ) : null}
            </VStack>
          </DrawerHeader>
          <DrawerBody py={4}>
            {attemptLoading ? (
              <HStack>
                <Spinner size="sm" />
                <Text fontSize="sm">Loading timeline…</Text>
              </HStack>
            ) : attemptEvents.length === 0 ? (
              <Text color="gray.500" fontSize="sm">
                No events for this attempt.
              </Text>
            ) : (
              <VStack align="stretch" spacing={3}>
                {attemptEvents.map((ev) => {
                  const offset =
                    new Date(ev.createdAt).getTime() - attemptStartMs;
                  return (
                    <Box
                      key={ev.id}
                      borderWidth="1px"
                      borderRadius="md"
                      p={3}
                      borderLeftWidth="4px"
                      borderLeftColor={`${levelColor(ev.level)}.400`}
                    >
                      <HStack justify="space-between" mb={1} flexWrap="wrap">
                        <HStack spacing={2}>
                          <Badge colorScheme={levelColor(ev.level)}>
                            {ev.level}
                          </Badge>
                          <Text fontFamily="mono" fontSize="sm" fontWeight="semibold">
                            {ev.type}
                          </Text>
                        </HStack>
                        <Text fontSize="xs" color="gray.500">
                          +{formatDuration(offset)}
                        </Text>
                      </HStack>
                      <Text fontSize="xs" color="gray.500" mb={1}>
                        {formatTime(ev.createdAt)} · {ev.source}
                        {ev.sandbox ? " · sandbox" : ""}
                      </Text>
                      <SimpleGrid columns={2} spacing={1} fontSize="xs">
                        {ev.durationMs != null ? (
                          <Text>duration: {formatDuration(ev.durationMs)}</Text>
                        ) : null}
                        {ev.bytes != null ? (
                          <Text>bytes: {formatBytes(ev.bytes)}</Text>
                        ) : null}
                        {ev.originalBytes != null ? (
                          <Text>
                            original: {formatBytes(ev.originalBytes)}
                          </Text>
                        ) : null}
                        {ev.errorCode ? (
                          <Text>code: {ev.errorCode}</Text>
                        ) : null}
                        {ev.platform || ev.browser ? (
                          <Text>
                            {[ev.platform, ev.browser].filter(Boolean).join(" / ")}
                          </Text>
                        ) : null}
                        {ev.connection ? (
                          <Text>conn: {ev.connection}</Text>
                        ) : null}
                      </SimpleGrid>
                      {ev.errorMessage ? (
                        <Text fontSize="xs" color="red.600" mt={1}>
                          {ev.errorMessage}
                        </Text>
                      ) : null}
                      {ev.meta != null ? (
                        <details style={{ marginTop: 8 }}>
                          <summary
                            style={{
                              cursor: "pointer",
                              fontSize: 12,
                              color: "#718096",
                            }}
                          >
                            meta
                          </summary>
                          <Code
                            display="block"
                            whiteSpace="pre-wrap"
                            fontSize="xs"
                            p={2}
                            mt={1}
                            borderRadius="md"
                          >
                            {JSON.stringify(ev.meta, null, 2)}
                          </Code>
                        </details>
                      ) : null}
                    </Box>
                  );
                })}
              </VStack>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </NavContainer>
  );
}
