import { Button, IconButton, Table, TableContainer, Tbody, Td, Text, Th, Thead, Tr } from "@chakra-ui/react";
import { FaTrash } from "react-icons/fa";
import type { SerializedUploadTestRun } from "../../lib/uploadTesting/storage";
import type { SavedMetrics, SavedSettings } from "../../lib/uploadTesting/view";
import { fmtMs } from "../../lib/uploadTesting/format";
import { describeConfig } from "../../lib/uploadTesting/presets";

function rowStats(run: SerializedUploadTestRun) {
  const m = run.metrics as Partial<SavedMetrics> | null;
  const s = run.settings as Partial<SavedSettings> | null;
  const c = m?.compress;
  const ratio = c && c.input.sizeBytes > 0 ? c.output.sizeBytes / c.input.sizeBytes : null;
  return {
    label: s?.label ?? (s?.config ? describeConfig(s.config) : "—"),
    ratio: ratio != null ? `${(ratio * 100).toFixed(0)}%` : "—",
    uploadMs: m?.uploads?.compressed?.summary?.totalMs,
    firstFrameMs: m?.downloads?.compressed?.firstFrameCdn?.playingMs,
  };
}

export default function RunHistory({
  runs,
  onLoad,
  onDelete,
  activeId,
}: {
  runs: SerializedUploadTestRun[];
  onLoad: (run: SerializedUploadTestRun) => void;
  onDelete: (run: SerializedUploadTestRun) => void;
  activeId?: string | null;
}) {
  if (runs.length === 0) return <Text fontSize="sm" color="gray.500">No saved runs yet.</Text>;
  return (
    <TableContainer>
      <Table size="sm">
        <Thead>
          <Tr>
            <Th>Date</Th>
            <Th>Device</Th>
            <Th>Network</Th>
            <Th>Preset / summary</Th>
            <Th isNumeric>Ratio</Th>
            <Th isNumeric>Upload</Th>
            <Th isNumeric>First frame</Th>
            <Th />
          </Tr>
        </Thead>
        <Tbody>
          {runs.map((run) => {
            const s = rowStats(run);
            return (
              <Tr key={run.id} bg={activeId === run.id ? "purple.50" : undefined}>
                <Td>{new Date(run.createdAt).toLocaleString()}</Td>
                <Td>{run.deviceLabel ?? "—"}</Td>
                <Td>{run.connection ?? "—"}</Td>
                <Td maxW="260px" whiteSpace="normal" fontSize="xs">
                  {s.label}
                  <br />
                  <Text as="span" color="gray.500">
                    {run.fileName}
                  </Text>
                </Td>
                <Td isNumeric>{s.ratio}</Td>
                <Td isNumeric>{fmtMs(s.uploadMs)}</Td>
                <Td isNumeric>{fmtMs(s.firstFrameMs)}</Td>
                <Td>
                  <Button size="xs" mr={1} onClick={() => onLoad(run)}>
                    Load
                  </Button>
                  <IconButton aria-label="Delete run" size="xs" variant="ghost" icon={<FaTrash />} onClick={() => onDelete(run)} />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </TableContainer>
  );
}
