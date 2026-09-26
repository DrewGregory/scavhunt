import type { DragEvent } from "react";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";

export type PlayerSurveyCardUser = {
  id: string;
  name: string;
  email: string;
  intent: string | null;
  teamPreferences: string | null;
  competitiveness: string | null;
  timeCommitment: string | null;
  surveyCompletedAt: string | null;
  isActive?: boolean;
};

function SurveyLine({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value?.trim()) return null;
  return (
    <Text fontSize="xs" color="gray.600" noOfLines={2} title={value}>
      <Text as="span" fontWeight="semibold" color="gray.500">
        {label}:{" "}
      </Text>
      {value}
    </Text>
  );
}

export default function PlayerSurveyCard({
  user,
  draggable = false,
  onDragStart,
  compact = false,
}: {
  user: PlayerSurveyCardUser;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  compact?: boolean;
}) {
  const intentLabel =
    user.intent || (user.surveyCompletedAt ? "—" : "survey incomplete");

  return (
    <Box
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="md"
      px={3}
      py={2}
      boxShadow="sm"
      cursor={draggable ? "grab" : "default"}
      _active={draggable ? { cursor: "grabbing" } : undefined}
      draggable={draggable}
      onDragStart={onDragStart}
      userSelect="none"
      opacity={user.isActive === false ? 0.55 : 1}
    >
      <VStack align="stretch" spacing={compact ? 0.5 : 1}>
        <HStack justify="space-between" align="flex-start" spacing={2}>
          <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
            {user.name}
          </Text>
          <Text
            fontSize="xs"
            px={1.5}
            py={0.5}
            borderRadius="full"
            bg={
              user.intent === "playing"
                ? "green.50"
                : user.intent === "browsing"
                  ? "gray.100"
                  : "orange.50"
            }
            color={
              user.intent === "playing"
                ? "green.700"
                : user.intent === "browsing"
                  ? "gray.600"
                  : "orange.700"
            }
            whiteSpace="nowrap"
          >
            {intentLabel}
          </Text>
        </HStack>
        {!compact && (
          <Text fontSize="xs" color="gray.500" noOfLines={1}>
            {user.email}
          </Text>
        )}
        <SurveyLine label="Prefs" value={user.teamPreferences} />
        <SurveyLine label="Compete" value={user.competitiveness} />
        <SurveyLine label="Time" value={user.timeCommitment} />
      </VStack>
    </Box>
  );
}
