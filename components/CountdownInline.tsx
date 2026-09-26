"use client";

import { Heading, Text, VStack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import Countdown from "react-countdown";

export default function CountdownInline({ startTime }: { startTime: Date }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) {
    return (
      <Text fontSize="lg" color="whiteAlpha.800" textAlign="center" w="100%">
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
      <Heading size="md" color="white" textAlign="center" w="100%">
        Let the games begin!
      </Heading>
    );
  }
  return (
    <VStack spacing={1} align="center" w="100%">
      <Heading
        size={{ base: "lg", md: "xl" }}
        color="white"
        fontWeight="800"
        textAlign="center"
      >
        {days > 0 ? `${days}d ` : ""}
        {String(hours).padStart(2, "0")}:
        {String(minutes).padStart(2, "0")}:
        {String(seconds).padStart(2, "0")}
      </Heading>
      <Text
        fontSize="xs"
        color="whiteAlpha.700"
        textTransform="uppercase"
        textAlign="center"
      >
        until kickoff
      </Text>
    </VStack>
  );
}
