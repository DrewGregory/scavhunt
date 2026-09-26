import { Box, Text } from "@chakra-ui/react";
import dynamic from "next/dynamic";
import type { ThroughputPoint } from "../../lib/uploadTesting/metrics";

const ResponsiveLine = dynamic(() => import("@nivo/line").then((m) => m.ResponsiveLine), { ssr: false });

export type ThroughputSeries = { id: string; points: ThroughputPoint[] };

export default function ThroughputChart({ series }: { series: ThroughputSeries[] }) {
  const data = series
    .filter((s) => s.points.length > 0)
    .map((s) => ({ id: s.id, data: s.points.map((p) => ({ x: p.tSec, y: Number(p.mbps.toFixed(3)) })) }));
  if (data.length === 0) return <Text fontSize="sm" color="gray.500">No throughput samples.</Text>;
  return (
    <Box h="220px">
      <ResponsiveLine
        data={data}
        margin={{ top: 10, right: 16, bottom: 40, left: 48 }}
        xScale={{ type: "linear", min: 0 }}
        yScale={{ type: "linear", min: 0, max: "auto" }}
        curve="monotoneX"
        enablePoints={false}
        enableArea
        areaOpacity={0.1}
        axisBottom={{ legend: "seconds", legendOffset: 32, legendPosition: "middle" }}
        axisLeft={{ legend: "MB/s", legendOffset: -40, legendPosition: "middle" }}
        colors={{ scheme: "category10" }}
        useMesh
        legends={
          data.length > 1
            ? [{ anchor: "top-right", direction: "column", itemWidth: 90, itemHeight: 16, translateX: 0 }]
            : []
        }
      />
    </Box>
  );
}
