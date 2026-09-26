import { Alert, AlertIcon, Table, TableContainer, Tbody, Td, Text, Th, Thead, Tr, VStack } from "@chakra-ui/react";
import type { DownloadBench as Bench, DownloadSuite, FirstFrameBench } from "../../lib/uploadTesting/benchmarks";
import { CORS_HINT } from "../../lib/uploadTesting/benchmarks";
import { fmtBytes, fmtMBps, fmtMs } from "../../lib/uploadTesting/format";
import type { UploadLabel } from "../../lib/uploadTesting/run";

function BenchRow({ name, b }: { name: string; b: Bench }) {
  return (
    <Tr>
      <Td>{name}</Td>
      {b.ok ? (
        <>
          <Td isNumeric>{fmtMs(b.ttfbMs)}</Td>
          <Td isNumeric>{fmtMs(b.totalMs)}</Td>
          <Td isNumeric>{fmtMBps(b.mbps)}</Td>
          <Td>
            {fmtBytes(b.bytes)}
            {b.cacheHint ? ` · ${b.cacheHint}` : ""}
          </Td>
        </>
      ) : (
        <Td colSpan={4} color="red.500" fontSize="xs">
          {b.error ?? "failed"}
        </Td>
      )}
    </Tr>
  );
}

function FrameRow({ name, f }: { name: string; f: FirstFrameBench | null }) {
  if (!f) return null;
  return (
    <Tr>
      <Td>{name}</Td>
      <Td isNumeric>{fmtMs(f.loadedDataMs)}</Td>
      <Td isNumeric>{fmtMs(f.playingMs)}</Td>
      <Td colSpan={2} color="red.500" fontSize="xs">
        {f.error ?? ""}
      </Td>
    </Tr>
  );
}

export default function DownloadBench({ downloads }: { downloads: Partial<Record<UploadLabel, DownloadSuite>> }) {
  const entries = Object.entries(downloads) as Array<[UploadLabel, DownloadSuite]>;
  if (entries.length === 0) return <Text fontSize="sm" color="gray.500">No download benchmarks yet.</Text>;
  const corsFailure = entries.some(([, s]) => [s.origin, s.cdnCold, s.cdnWarm, s.browserCache].some((b) => b.error === CORS_HINT));
  return (
    <VStack align="stretch" spacing={4}>
      {corsFailure && (
        <Alert status="warning" fontSize="sm">
          <AlertIcon />
          Some requests failed at the network level — usually CORS. Allow GET/HEAD from this origin in the Spaces bucket CORS settings.
        </Alert>
      )}
      {entries.map(([label, s]) => (
        <TableContainer key={label}>
          <Text fontWeight="semibold" fontSize="sm" mb={1}>
            {label}
          </Text>
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>Variant</Th>
                <Th isNumeric>First byte</Th>
                <Th isNumeric>Full</Th>
                <Th isNumeric>Speed</Th>
                <Th>Size / cache</Th>
              </Tr>
            </Thead>
            <Tbody>
              <BenchRow name="Origin" b={s.origin} />
              <BenchRow name="CDN cold" b={s.cdnCold} />
              <BenchRow name="CDN warm" b={s.cdnWarm} />
              <BenchRow name="Browser cache" b={s.browserCache} />
            </Tbody>
            {(s.firstFrameOrigin || s.firstFrameCdn) && (
              <>
                <Thead>
                  <Tr>
                    <Th>First frame</Th>
                    <Th isNumeric>loadeddata</Th>
                    <Th isNumeric>playing</Th>
                    <Th colSpan={2} />
                  </Tr>
                </Thead>
                <Tbody>
                  <FrameRow name="Origin" f={s.firstFrameOrigin} />
                  <FrameRow name="CDN" f={s.firstFrameCdn} />
                </Tbody>
              </>
            )}
          </Table>
        </TableContainer>
      ))}
    </VStack>
  );
}
