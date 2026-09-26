import { Checkbox, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from "@chakra-ui/react";
import type { TestView } from "../../lib/uploadTesting/view";
import { fmtBytes, fmtMBps, fmtMs, fmtPct, savedPct } from "../../lib/uploadTesting/format";

export type CompareColumn = { label: string; view: TestView };

type Row = [string, (v: TestView) => string];

const ROWS: Row[] = [
  ["Output", (v) => (v.compress ? `${v.compress.output.width ?? "?"}×${v.compress.output.height ?? "?"} ${v.compress.output.codec ?? ""}` : "—")],
  ["Size", (v) => fmtBytes(v.compress?.output.sizeBytes ?? v.uploads.compressed?.summary.bytes)],
  ["Saved", (v) => (v.compress ? fmtPct(savedPct(v.compress.input.sizeBytes, v.compress.output.sizeBytes)) : "—")],
  ["Compress", (v) => (v.compress?.compressed ? `${fmtMs(v.compress.compressMs)} (${v.compress.realtimeFactor?.toFixed(2) ?? "?"}×)` : v.compress?.skippedReason ?? "—")],
  ["Upload", (v) => fmtMs(v.uploads.compressed?.summary.totalMs)],
  ["Upload speed", (v) => fmtMBps(v.uploads.compressed?.summary.effectiveMBps)],
  ["Parts / retries", (v) => {
    const s = v.uploads.compressed?.summary;
    return s ? `${s.parts} / ${s.partRetries + s.signRetries}` : "—";
  }],
  ["Sign overhead", (v) => fmtPct(v.uploads.compressed?.summary.signOverheadPct)],
  ["CDN cold TTFB", (v) => fmtMs(v.downloads.compressed?.cdnCold.ttfbMs)],
  ["CDN warm full", (v) => fmtMs(v.downloads.compressed?.cdnWarm.totalMs)],
  ["First frame (CDN)", (v) => fmtMs(v.downloads.compressed?.firstFrameCdn?.playingMs)],
  ["Original upload", (v) => fmtMs(v.uploads.original?.summary.totalMs)],
];

export default function CompareTable({
  columns,
  selected,
  onToggle,
}: {
  columns: CompareColumn[];
  selected: number[];
  onToggle: (index: number) => void;
}) {
  return (
    <TableContainer>
      <Table size="sm">
        <Thead>
          <Tr>
            <Th />
            {columns.map((c, i) => (
              <Th key={i} textTransform="none">
                <Checkbox size="sm" isChecked={selected.includes(i)} onChange={() => onToggle(i)}>
                  {c.label}
                </Checkbox>
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {ROWS.map(([name, get]) => (
            <Tr key={name}>
              <Td fontWeight="semibold">{name}</Td>
              {columns.map((c, i) => (
                <Td key={i}>{get(c.view)}</Td>
              ))}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
}
