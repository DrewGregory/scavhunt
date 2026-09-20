"use client";

import { Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { formatDistanceStrict, isPast } from "date-fns";

export function RoundCountdownBanner({
  round,
  endsAtISO,
  tone = "dark",
  onExpired,
}: {
  round: number | null;
  endsAtISO: string | null;
  /** dark = light text (home hero); light = dark text (tournament page) */
  tone?: "dark" | "light";
  onExpired?: () => void;
}) {
  const [, setTick] = useState(0);
  const muted = tone === "dark" ? "whiteAlpha.800" : "gray.600";
  const emphasis = tone === "dark" ? "yellow.200" : "orange.600";

  useEffect(() => {
    if (!endsAtISO) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [endsAtISO]);

  useEffect(() => {
    if (!endsAtISO || !onExpired) return;
    if (!isPast(new Date(endsAtISO))) return;
    const t = setTimeout(() => onExpired(), 1200);
    return () => clearTimeout(t);
  }, [endsAtISO, onExpired]);

  if (round == null) {
    return (
      <Text fontSize="sm" color={muted} textAlign="center">
        Tournament not open yet
      </Text>
    );
  }

  if (!endsAtISO) {
    return (
      <Text fontSize="sm" color={muted} textAlign="center">
        Round {round} voting is open · end time not scheduled yet
      </Text>
    );
  }

  const endsAt = new Date(endsAtISO);
  if (isPast(endsAt)) {
    return (
      <Text fontSize="sm" color={emphasis} textAlign="center" fontWeight="bold">
        Round {round} just ended — refreshing bracket…
      </Text>
    );
  }

  const remaining = formatDistanceStrict(endsAt, new Date(), {
    addSuffix: false,
  });

  return (
    <Text
      fontSize={{ base: "sm", md: "md" }}
      color={emphasis}
      textAlign="center"
      fontWeight="bold"
      letterSpacing="wide"
    >
      Round {round} voting ends in {remaining}
    </Text>
  );
}
