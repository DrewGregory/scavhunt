"use client";

import { Heading, Text, VStack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import Countdown from "react-countdown";

export default function CountdownInline({ startTime }: { startTime: Date }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) {
    return (
      <Text fontSize="lg" color="whiteAlpha.800">
        Loading countdown…
      </Text>
    );
  }
  return <Countdown date={startTime} renderer={Renderer} />;
}

function Renderer({
  days,
  hours,
  minutes,
  seconds,
  completed,
}: {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  completed: boolean;
}) {
  if (completed) {
    return (
      <Heading size="md" color="white">
        Let the games begin!
      </Heading>
    );
  }
  return (
    <VStack spacing={1}>
      <Heading size={{ base: "lg", md: "xl" }} color="white" fontWeight="800">
        {days > 0 ? `${days}d ` : ""}
        {String(hours).padStart(2, "0")}:
        {String(minutes).padStart(2, "0")}:
        {String(seconds).padStart(2, "0")}
      </Heading>
      <Text fontSize="xs" color="whiteAlpha.700" textTransform="uppercase">
        until kickoff
      </Text>
    </VStack>
  );
}
