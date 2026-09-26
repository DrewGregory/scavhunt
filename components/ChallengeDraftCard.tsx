import {
  Badge,
  Box,
  HStack,
  IconButton,
  Input,
  Text,
  Textarea,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import type { DragEvent } from "react";
import { FiEdit2, FiMenu, FiTrash2, FiX } from "react-icons/fi";

export type DraftNeighborhood = {
  id: string;
  name: string;
  emoji: string;
};

export type DraftChallenge = {
  id: string;
  title: string;
  prompt: string;
  lat: number | null;
  lng: number | null;
  pts: number;
  numWinners: number;
  enabled: boolean;
  createdAt: string;
  neighborhood: DraftNeighborhood | null;
};

type Props = {
  challenge: DraftChallenge;
  selected?: boolean;
  editing?: boolean;
  onSelect?: () => void;
  onStartEdit?: () => void;
  onStopEdit?: () => void;
  onDragStart?: (e: DragEvent) => void;
  onChange: (patch: Partial<DraftChallenge>) => void;
  onClearLocation?: () => void;
  onArchive?: () => void;
};

function locationBadge(c: DraftChallenge): {
  label: string;
  colorScheme: string;
} {
  const placed = c.lat != null && c.lng != null;
  if (!placed) return { label: "No location", colorScheme: "gray" };
  if (!c.neighborhood) {
    return { label: "No neighborhood", colorScheme: "orange" };
  }
  return {
    label: `${c.neighborhood.emoji} ${c.neighborhood.name}`,
    colorScheme: "purple",
  };
}

function CardChrome({
  selected,
  onDragStart,
  onStartEdit,
  children,
}: {
  selected?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onStartEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <HStack align="flex-start" spacing={2}>
      <VStack spacing={0.5} flexShrink={0} pt={0.5}>
        <Box
          as="span"
          cursor="grab"
          color="gray.400"
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            onDragStart?.(e);
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to enable or disable"
          lineHeight={1}
        >
          <FiMenu />
        </Box>
        {onStartEdit && (
          <Tooltip label="Edit fields" placement="right">
            <IconButton
              aria-label="Edit"
              icon={<FiEdit2 />}
              size="xs"
              variant="ghost"
              minW="auto"
              h="auto"
              p={0.5}
              onClick={(e) => {
                e.stopPropagation();
                onStartEdit();
              }}
            />
          </Tooltip>
        )}
      </VStack>
      <Box flex={1} minW={0}>
        {children}
      </Box>
    </HStack>
  );
}

export default function ChallengeDraftCard({
  challenge,
  selected,
  editing,
  onSelect,
  onStartEdit,
  onStopEdit,
  onDragStart,
  onChange,
  onClearLocation,
  onArchive,
}: Props) {
  const placed = challenge.lat != null && challenge.lng != null;
  const badge = locationBadge(challenge);
  const promptPreview =
    challenge.prompt?.trim() && challenge.prompt.trim() !== ""
      ? challenge.prompt.trim()
      : null;

  if (editing) {
    return (
      <Box
        borderWidth="2px"
        borderRadius="md"
        bg={selected ? "orange.50" : "white"}
        borderColor={selected ? "orange.400" : "blue.200"}
        p={2}
        boxShadow={selected ? "md" : "sm"}
        data-challenge-id={challenge.id}
      >
        <CardChrome
          selected={selected}
          onDragStart={onDragStart}
          onStartEdit={undefined}
        >
          <VStack align="stretch" spacing={2}>
            <Input
              size="sm"
              fontWeight="semibold"
              value={challenge.title}
              onChange={(e) => onChange({ title: e.target.value })}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (!t) onChange({ title: "Untitled" });
              }}
              placeholder="Title"
              autoFocus
            />
            <Textarea
              size="sm"
              rows={3}
              value={challenge.prompt}
              placeholder="Description / prompt"
              onChange={(e) => onChange({ prompt: e.target.value })}
            />
            <HStack spacing={2}>
              <HStack spacing={1}>
                <Text fontSize="xs" color="gray.500">
                  pts
                </Text>
                <Input
                  size="xs"
                  type="number"
                  w="56px"
                  value={challenge.pts}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n > 0) onChange({ pts: n });
                  }}
                />
              </HStack>
              <HStack spacing={1}>
                <Text fontSize="xs" color="gray.500">
                  wins
                </Text>
                <Input
                  size="xs"
                  type="number"
                  w="48px"
                  value={challenge.numWinners}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 1) {
                      onChange({ numWinners: n });
                    }
                  }}
                />
              </HStack>
              <Badge
                fontSize="2xs"
                colorScheme={badge.colorScheme}
                maxW="50%"
                isTruncated
              >
                {badge.label}
              </Badge>
            </HStack>
            <Text fontSize="2xs" color="gray.500">
              Select on map, then drag the pin to place
              {placed ? " · " : ""}
              {placed && (
                <Text
                  as="button"
                  color="red.500"
                  textDecoration="underline"
                  onClick={() => onClearLocation?.()}
                >
                  Clear location
                </Text>
              )}
            </Text>
            <HStack justify="space-between">
              <IconButton
                aria-label="Done editing"
                icon={<FiX />}
                size="xs"
                variant="outline"
                onClick={() => onStopEdit?.()}
              />
              {onArchive && (
                <IconButton
                  aria-label="Archive"
                  icon={<FiTrash2 />}
                  size="xs"
                  variant="ghost"
                  colorScheme="red"
                  onClick={() => onArchive()}
                />
              )}
            </HStack>
          </VStack>
        </CardChrome>
      </Box>
    );
  }

  return (
    <Box
      borderWidth={selected ? "2px" : "1px"}
      borderRadius="md"
      bg={selected ? "orange.50" : "white"}
      borderColor={selected ? "orange.400" : "gray.200"}
      px={2.5}
      py={2}
      onClick={onSelect}
      cursor="pointer"
      boxShadow={selected ? "md" : undefined}
      outline={selected ? "2px solid" : undefined}
      outlineColor={selected ? "orange.300" : undefined}
      outlineOffset="1px"
      _hover={{ borderColor: selected ? "orange.400" : "gray.300" }}
      data-challenge-id={challenge.id}
    >
      <CardChrome
        selected={selected}
        onDragStart={onDragStart}
        onStartEdit={onStartEdit}
      >
        <VStack align="stretch" spacing={1}>
          <HStack align="flex-start" justify="space-between" spacing={2}>
            <Text fontSize="sm" fontWeight="semibold" noOfLines={2} flex={1}>
              {challenge.title}
            </Text>
            <Text
              fontSize="xs"
              color="gray.600"
              whiteSpace="nowrap"
              fontWeight="medium"
              flexShrink={0}
            >
              {challenge.pts} pts · {challenge.numWinners} win
              {challenge.numWinners === 1 ? "" : "s"}
            </Text>
          </HStack>
          {promptPreview && (
            <Text fontSize="xs" color="gray.600" noOfLines={2}>
              {promptPreview}
            </Text>
          )}
          <HStack justify="flex-end" pt={0.5}>
            <Badge
              fontSize="2xs"
              colorScheme={badge.colorScheme}
              maxW="100%"
              isTruncated
            >
              {badge.label}
            </Badge>
          </HStack>
          {selected && (
            <Text fontSize="2xs" color="orange.600" fontWeight="medium">
              Selected — drag pin on map to place
            </Text>
          )}
        </VStack>
      </CardChrome>
    </Box>
  );
}
