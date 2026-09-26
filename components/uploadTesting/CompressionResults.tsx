import { Badge, Table, TableContainer, Tbody, Td, Text, Th, Thead, Tr, VStack } from "@chakra-ui/react";
import type { MediaInfo } from "../../lib/upload/compress";
import type { MemorySample } from "../../lib/uploadTesting/benchmarks";
import type { CompressView } from "../../lib/uploadTesting/view";
import { fmtBytes, fmtMbps, fmtMs, fmtPct, savedPct } from "../../lib/uploadTesting/format";

function res(m: MediaInfo) {
  return m.width && m.height ? `${m.width}×${m.height}` : "—";
}

export default function CompressionResults({ compress, memory }: { compress: CompressView; memory: MemorySample | null }) {
  const { input, output } = compress;
  const rows: Array<[string, string, string]> = [
    ["Codec", [input.codec, input.audioCodec].filter(Boolean).join(" / ") || "—", [output.codec, output.audioCodec].filter(Boolean).join(" / ") || "—"],
    ["Resolution", res(input), res(output)],
    ["FPS", input.fps ? input.fps.toFixed(1) : "—", output.fps ? output.fps.toFixed(1) : "—"],
    ["Bitrate", fmtMbps(input.bitrate), fmtMbps(output.bitrate)],
    ["Duration", input.durationSec ? `${input.durationSec.toFixed(1)} s` : "—", output.durationSec ? `${output.durationSec.toFixed(1)} s` : "—"],
    ["Size", fmtBytes(input.sizeBytes), fmtBytes(output.sizeBytes)],
  ];
  return (
    <VStack align="stretch" spacing={2}>
      <Text fontSize="sm">
        {compress.compressed ? (
          <Badge colorScheme="green">compressed</Badge>
        ) : (
          <Badge colorScheme="orange">skipped: {compress.skippedReason ?? "?"}</Badge>
        )}{" "}
        wall {fmtMs(compress.compressMs)} · realtime{" "}
        {compress.realtimeFactor != null ? `${compress.realtimeFactor.toFixed(2)}×` : "—"} ·{" "}
        {compress.usedWorker ? "worker" : "main thread"} · saved {fmtPct(savedPct(input.sizeBytes, output.sizeBytes))} · peak
        memory {memory?.bytes != null ? `${fmtBytes(memory.bytes)} (${memory.note})` : "n/a"}
      </Text>
      {compress.errorMessage && (
        <Text fontSize="xs" color="red.500">
          {compress.errorMessage}
        </Text>
      )}
      <TableContainer>
        <Table size="sm">
          <Thead>
            <Tr>
              <Th />
              <Th>Input</Th>
              <Th>Output</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map(([k, a, b]) => (
              <Tr key={k}>
                <Td fontWeight="semibold">{k}</Td>
                <Td>{a}</Td>
                <Td>{b}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    </VStack>
  );
}
