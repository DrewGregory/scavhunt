import { Box, HStack, Text, Tooltip } from "@chakra-ui/react";
import type { PartAttempt, Waterfall } from "../../lib/uploadTesting/metrics";
import { fmtBytes, fmtMs } from "../../lib/uploadTesting/format";

const ROW_H = 18;
const LABEL_W = 44;
const INFO_W = 90;

function segStyle(start: number, end: number, total: number) {
  const left = (start / total) * 100;
  const width = Math.max(0.3, ((end - start) / total) * 100);
  return { left: `${left}%`, width: `${width}%` };
}

function AttemptBars({ a, total, index }: { a: PartAttempt; total: number; index: number }) {
  const failed = a.status === "sign_error" || a.status === "put_error";
  const tip = [
    `attempt ${index + 1}: ${a.status}${a.injected ? " (injected)" : ""}`,
    a.signStart != null && a.signEnd != null ? `sign ${fmtMs(a.signEnd - a.signStart)}` : null,
    a.putStart != null && a.putEnd != null ? `PUT ${fmtMs(a.putEnd - a.putStart)}` : null,
    a.error,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Tooltip label={tip} fontSize="xs" hasArrow>
      <Box position="absolute" inset={0} pointerEvents="none">
        {a.signStart != null && (
          <Box
            position="absolute"
            top="4px"
            h="10px"
            bg={a.status === "sign_error" ? "red.400" : "yellow.400"}
            borderRadius="sm"
            pointerEvents="auto"
            {...segStyle(a.signStart, a.signEnd ?? a.putStart ?? total, total)}
          />
        )}
        {a.putStart != null && (
          <Box
            position="absolute"
            top="3px"
            h="12px"
            bg={failed ? "red.300" : a.status === "ok" ? "purple.400" : "purple.200"}
            borderRadius="sm"
            pointerEvents="auto"
            {...segStyle(a.putStart, a.putEnd ?? total, total)}
          />
        )}
        {failed && (
          <Text
            position="absolute"
            fontSize="10px"
            fontWeight="bold"
            color="red.600"
            top="1px"
            left={`${((a.putEnd ?? a.signEnd ?? 0) / total) * 100}%`}
          >
            ×
          </Text>
        )}
      </Box>
    </Tooltip>
  );
}

export default function PartWaterfall({ waterfall }: { waterfall: Waterfall }) {
  const total = Math.max(1, waterfall.durationMs);
  if (waterfall.rows.length === 0) return <Text fontSize="sm" color="gray.500">No part events.</Text>;
  return (
    <Box overflowX="auto">
      <Box minW="420px">
        <HStack fontSize="xs" color="gray.500" spacing={0} mb={1}>
          <Box w={`${LABEL_W}px`}>part</Box>
          <HStack flex="1" justify="space-between">
            <span>0</span>
            <span>{fmtMs(total / 2)}</span>
            <span>{fmtMs(total)}</span>
          </HStack>
          <Box w={`${INFO_W}px`} textAlign="right">
            size · tries
          </Box>
        </HStack>
        <Box maxH="360px" overflowY="auto">
          {waterfall.rows.map((row) => (
            <HStack key={row.partNumber} spacing={0} h={`${ROW_H}px`} fontSize="xs">
              <Box w={`${LABEL_W}px`} fontFamily="mono">
                #{row.partNumber}
              </Box>
              <Box flex="1" position="relative" h="100%" bg="gray.50" borderBottom="1px solid" borderColor="gray.100">
                {row.attempts.map((a, i) => (
                  <AttemptBars key={i} a={a} total={total} index={i} />
                ))}
              </Box>
              <Box w={`${INFO_W}px`} textAlign="right" color={row.status === "ok" ? undefined : "red.500"}>
                {fmtBytes(row.bytes)} · {row.attempts.length}
              </Box>
            </HStack>
          ))}
        </Box>
        <HStack fontSize="xs" color="gray.600" mt={2} spacing={4} flexWrap="wrap">
          <HStack spacing={1}>
            <Box w="10px" h="10px" bg="yellow.400" borderRadius="sm" />
            <span>sign</span>
          </HStack>
          <HStack spacing={1}>
            <Box w="10px" h="10px" bg="purple.400" borderRadius="sm" />
            <span>PUT</span>
          </HStack>
          <HStack spacing={1}>
            <Box w="10px" h="10px" bg="red.300" borderRadius="sm" />
            <span>failed attempt ×</span>
          </HStack>
        </HStack>
      </Box>
    </Box>
  );
}
