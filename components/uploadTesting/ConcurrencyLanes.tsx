import { Box, HStack, Text } from "@chakra-ui/react";
import type { buildConcurrency } from "../../lib/uploadTesting/metrics";
import { fmtMs } from "../../lib/uploadTesting/format";

type Concurrency = ReturnType<typeof buildConcurrency>;

export default function ConcurrencyLanes({ data, durationMs }: { data: Concurrency; durationMs: number }) {
  const total = Math.max(1, durationMs, ...data.lanes.map((l) => l.end));
  if (data.laneCount === 0) return <Text fontSize="sm" color="gray.500">No PUTs recorded.</Text>;
  const maxY = Math.max(1, data.maxInFlight);
  const W = 1000;
  const H = 60;
  let path = "";
  data.points.forEach((p, i) => {
    const x = (p.t / total) * W;
    const y = H - (p.inFlight / maxY) * H;
    path += i === 0 ? `M${x},${y}` : ` H${x} V${y}`;
  });
  path += ` H${W}`;

  return (
    <Box overflowX="auto">
      <Box minW="420px">
        {Array.from({ length: data.laneCount }, (_, slot) => (
          <HStack key={slot} spacing={0} h="14px" fontSize="xs">
            <Box w="44px" color="gray.500">
              slot {slot + 1}
            </Box>
            <Box flex="1" position="relative" h="10px" bg="gray.50">
              {data.lanes
                .filter((l) => l.slot === slot)
                .map((l, i) => (
                  <Box
                    key={i}
                    position="absolute"
                    top={0}
                    bottom={0}
                    left={`${(l.start / total) * 100}%`}
                    width={`${Math.max(0.3, ((l.end - l.start) / total) * 100)}%`}
                    bg={l.ok ? "teal.400" : "red.300"}
                    borderRadius="sm"
                  />
                ))}
            </Box>
          </HStack>
        ))}
        <HStack spacing={0} mt={2} align="start">
          <Box w="44px" fontSize="xs" color="gray.500">
            in-flight
            <br />
            max {data.maxInFlight}
          </Box>
          <Box flex="1">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="60" preserveAspectRatio="none">
              <path d={path} fill="none" stroke="#319795" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
            <HStack justify="space-between" fontSize="xs" color="gray.500">
              <span>0</span>
              <span>{fmtMs(total)}</span>
            </HStack>
          </Box>
        </HStack>
      </Box>
    </Box>
  );
}
