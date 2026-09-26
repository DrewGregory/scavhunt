import {
  Badge,
  Box,
  Collapse,
  HStack,
  IconButton,
  Input,
  Text,
  Textarea,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import type { DragEvent } from "react";
import { useState } from "react";
import { FiChevronDown, FiChevronUp, FiMapPin, FiMenu, FiTrash2, FiX } from "react-icons/fi";

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
  onSelect?: () => void;
  onDragStart?: (e: DragEvent) => void;
  onChange: (patch: Partial<DraftChallenge>) => void;
  onPlaceOnMap?: () => void;
  onClearLocation?: () => void;
  onArchive?: () => void;
};

export default function ChallengeDraftCard({
  challenge,
  selected,
  onSelect,
  onDragStart,
  onChange,
  onPlaceOnMap,
  onClearLocation,
  onArchive,
}: Props) {
  const [promptOpen, setPromptOpen] = useState(false);
  const placed = challenge.lat != null && challenge.lng != null;

  return (
    <Box
      borderWidth="1px"
      borderRadius="md"
      bg={selected ? "blue.50" : "white"}
      borderColor={selected ? "blue.300" : "gray.200"}
      p={2}
      onClick={onSelect}
      boxShadow={selected ? "sm" : undefined}
      data-challenge-id={challenge.id}
    >
      <HStack align="flex-start" spacing={1}>
        <Box
          as="span"
          cursor="grab"
          color="gray.400"
          pt={1}
          flexShrink={0}
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            onDragStart?.(e);
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to enable or disable"
        >
          <FiMenu />
        </Box>
        <VStack align="stretch" spacing={1} flex={1} minW={0}>
          <Input
            size="xs"
            fontWeight="semibold"
            value={challenge.title}
            onChange={(e) => onChange({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const t = e.target.value.trim();
              if (!t) onChange({ title: "Untitled" });
            }}
            variant="flushed"
            placeholder="Title"
          />
          <HStack spacing={1} flexWrap="wrap">
            <HStack spacing={0.5}>
              <Text fontSize="2xs" color="gray.500">
                pts
              </Text>
              <Input
                size="xs"
                type="number"
                w="52px"
                value={challenge.pts}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) onChange({ pts: n });
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </HStack>
            <HStack spacing={0.5}>
              <Text fontSize="2xs" color="gray.500">
                win
              </Text>
              <Input
                size="xs"
                type="number"
                w="44px"
                value={challenge.numWinners}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 1) onChange({ numWinners: n });
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </HStack>
            {challenge.neighborhood ? (
              <Badge fontSize="2xs" colorScheme="purple" maxW="100%" isTruncated>
                {challenge.neighborhood.emoji} {challenge.neighborhood.name}
              </Badge>
            ) : (
              <Badge fontSize="2xs" colorScheme="gray">
                Unplaced
              </Badge>
            )}
          </HStack>
          <HStack spacing={1}>
            <IconButton
              aria-label="Toggle prompt"
              icon={promptOpen ? <FiChevronUp /> : <FiChevronDown />}
              size="xs"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setPromptOpen((o) => !o);
              }}
            />
            <Tooltip label={placed ? "Reposition on map" : "Set location on map"}>
              <IconButton
                aria-label="Set on map"
                icon={<FiMapPin />}
                size="xs"
                variant="ghost"
                colorScheme={placed ? "blue" : "gray"}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlaceOnMap?.();
                }}
              />
            </Tooltip>
            {placed && (
              <IconButton
                aria-label="Clear location"
                icon={<FiX />}
                size="xs"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearLocation?.();
                }}
              />
            )}
            {onArchive && (
              <IconButton
                aria-label="Archive"
                icon={<FiTrash2 />}
                size="xs"
                variant="ghost"
                colorScheme="red"
                ml="auto"
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive();
                }}
              />
            )}
          </HStack>
          <Collapse in={promptOpen} animateOpacity>
            <Textarea
              size="xs"
              rows={3}
              value={challenge.prompt}
              placeholder="Prompt"
              onChange={(e) => onChange({ prompt: e.target.value })}
              onClick={(e) => e.stopPropagation()}
            />
          </Collapse>
        </VStack>
      </HStack>
    </Box>
  );
}
