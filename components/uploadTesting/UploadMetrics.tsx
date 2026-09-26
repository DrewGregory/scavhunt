import {
  Badge,
  Box,
  Heading,
  SimpleGrid,
  Stat,
  StatHelpText,
  StatLabel,
  StatNumber,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from "@chakra-ui/react";
import type { UploadView } from "../../lib/uploadTesting/view";
import { fmtBytes, fmtMBps, fmtMs, fmtPct } from "../../lib/uploadTesting/format";
import PartWaterfall from "./PartWaterfall";
import ConcurrencyLanes from "./ConcurrencyLanes";
import ThroughputChart from "./ThroughputChart";

export function UploadSummaryStats({ upload }: { upload: UploadView }) {
  const s = upload.summary;
  const items: Array<[string, string, string?]> = [
    ["Total", fmtMs(s.totalMs), fmtBytes(s.bytes)],
    ["Effective", fmtMBps(s.effectiveMBps), `avg ${fmtMBps(s.avgMBps)} · p10 ${fmtMBps(s.p10MBps)}`],
    ["Parts", String(s.parts), s.multipart ? `multipart · max ${s.maxInFlight} in flight` : "single PUT"],
    ["Sign overhead", fmtPct(s.signOverheadPct), `${fmtMs(s.signMs)} sign / ${fmtMs(s.putMs)} PUT`],
    ["Retries", String(s.partRetries + s.signRetries), `${s.partRetries} PUT · ${s.signRetries} sign · ${s.injectedFailures} injected`],
    ["Stalls / resumes", `${s.stalls} / ${s.resumes}`],
  ];
  return (
    <SimpleGrid columns={{ base: 2, md: 3 }} spacing={3}>
      {items.map(([label, value, help]) => (
        <Stat key={label} size="sm">
          <StatLabel>{label}</StatLabel>
          <StatNumber fontSize="lg">{value}</StatNumber>
          {help && <StatHelpText fontSize="xs" mb={0}>{help}</StatHelpText>}
        </Stat>
      ))}
    </SimpleGrid>
  );
}

export function LifecycleLog({ upload }: { upload: UploadView }) {
  const signCount = upload.waterfall.rows.reduce((n, r) => n + r.attempts.filter((a) => a.signStart != null).length, 0);
  const putCount = upload.waterfall.rows.reduce((n, r) => n + r.attempts.filter((a) => a.putStart != null).length, 0);
  return (
    <TableContainer>
      <Table size="sm">
        <Thead>
          <Tr>
            <Th>Step</Th>
            <Th>At</Th>
            <Th>Status</Th>
            <Th isNumeric>ms</Th>
          </Tr>
        </Thead>
        <Tbody>
          {upload.lifecycle.map((l, i) => (
            <Tr key={i}>
              <Td>{l.step}</Td>
              <Td>{fmtMs(l.atMs)}</Td>
              <Td>
                <Badge colorScheme={l.ok ? "green" : "red"}>{l.status || "net"}</Badge>
                {l.error && (
                  <Text as="span" fontSize="xs" color="red.500" ml={2}>
                    {l.error}
                  </Text>
                )}
              </Td>
              <Td isNumeric>{Math.round(l.ms)}</Td>
            </Tr>
          ))}
          <Tr>
            <Td>sign (×{signCount})</Td>
            <Td>—</Td>
            <Td>{upload.summary.signRetries} retried</Td>
            <Td isNumeric>{Math.round(upload.summary.signMs)}</Td>
          </Tr>
          <Tr>
            <Td>put (×{putCount})</Td>
            <Td>—</Td>
            <Td>{upload.summary.partRetries} retried</Td>
            <Td isNumeric>{Math.round(upload.summary.putMs)}</Td>
          </Tr>
        </Tbody>
      </Table>
    </TableContainer>
  );
}

export default function UploadMetrics({ label, upload }: { label: string; upload: UploadView }) {
  return (
    <VStack align="stretch" spacing={4}>
      <Heading size="sm">
        {label} upload{" "}
        <Badge colorScheme={upload.ok ? "green" : "red"}>{upload.ok ? "ok" : "failed"}</Badge>
      </Heading>
      {upload.error && (
        <Text fontSize="sm" color="red.500">
          {upload.error}
        </Text>
      )}
      <UploadSummaryStats upload={upload} />
      <Box>
        <Text fontWeight="semibold" fontSize="sm" mb={1}>
          Part waterfall
        </Text>
        <PartWaterfall waterfall={upload.waterfall} />
      </Box>
      <Box>
        <Text fontWeight="semibold" fontSize="sm" mb={1}>
          Concurrency lanes
        </Text>
        <ConcurrencyLanes data={upload.concurrency} durationMs={upload.waterfall.durationMs} />
      </Box>
      <Box>
        <Text fontWeight="semibold" fontSize="sm" mb={1}>
          Throughput
        </Text>
        <ThroughputChart series={[{ id: label, points: upload.throughput }]} />
      </Box>
      {upload.chaosLog.length > 0 && (
        <Box fontSize="xs" fontFamily="mono" color="orange.700">
          {upload.chaosLog.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </Box>
      )}
      <Box>
        <Text fontWeight="semibold" fontSize="sm" mb={1}>
          Lifecycle log
        </Text>
        <LifecycleLog upload={upload} />
      </Box>
    </VStack>
  );
}
