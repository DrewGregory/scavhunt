import type { DragEvent } from "react";
import { useState } from "react";
import {
  Box,
  Collapse,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";

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

function IntentBadge({ user }: { user: PlayerSurveyCardUser }) {
  const intentLabel =
    user.intent || (user.surveyCompletedAt ? "—" : "no survey");
  return (
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
      flexShrink={0}
    >
      {intentLabel}
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
  /** One-line name + badge; survey details behind a toggle. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasDetails = Boolean(
    user.teamPreferences?.trim() ||
      user.competitiveness?.trim() ||
      user.timeCommitment?.trim() ||
      user.email,
  );

  return (
    <Box
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="md"
      px={2}
      py={compact ? 1 : 2}
      boxShadow="sm"
      cursor={draggable ? "grab" : "default"}
      _active={draggable ? { cursor: "grabbing" } : undefined}
      draggable={draggable}
      onDragStart={onDragStart}
      userSelect="none"
      opacity={user.isActive === false ? 0.55 : 1}
      minW={0}
    >
      {compact ? (
        <VStack align="stretch" spacing={1}>
          <HStack spacing={1} minW={0} align="center">
            <IconButton
              aria-label={open ? "Hide details" : "Show details"}
              icon={open ? <ChevronDownIcon /> : <ChevronRightIcon />}
              size="xs"
              variant="ghost"
              minW="20px"
              h="20px"
              isDisabled={!hasDetails}
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <Text fontSize="sm" fontWeight="semibold" noOfLines={1} flex="1" minW={0}>
              {user.name}
            </Text>
            <IntentBadge user={user} />
          </HStack>
          <Collapse in={open} animateOpacity>
            <VStack align="stretch" spacing={0.5} pl={6} pb={1}>
              <Text fontSize="xs" color="gray.500" noOfLines={1}>
                {user.email}
              </Text>
              <SurveyLine label="Prefs" value={user.teamPreferences} />
              <SurveyLine label="Compete" value={user.competitiveness} />
              <SurveyLine label="Time" value={user.timeCommitment} />
            </VStack>
          </Collapse>
        </VStack>
      ) : (
        <VStack align="stretch" spacing={1}>
          <HStack justify="space-between" align="flex-start" spacing={2}>
            <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
              {user.name}
            </Text>
            <IntentBadge user={user} />
          </HStack>
          <Text fontSize="xs" color="gray.500" noOfLines={1}>
            {user.email}
          </Text>
          <SurveyLine label="Prefs" value={user.teamPreferences} />
          <SurveyLine label="Compete" value={user.competitiveness} />
          <SurveyLine label="Time" value={user.timeCommitment} />
        </VStack>
      )}
    </Box>
  );
}
