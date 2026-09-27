import {
  Box,
  Button,
  HStack,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  SimpleGrid,
  Text,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import { useEffect, useId, useState } from "react";
import {
  DEFAULT_TEAM_COLOR,
  TEAM_COLOR_PALETTE,
  normalizeTeamColor,
} from "../lib/teamColors";

type Props = {
  value: string;
  ariaLabel: string;
  onChange: (color: string) => void;
  /** Compact trigger for dense admin tables. */
  size?: "sm" | "md";
};

/**
 * Preset swatches first; native RGB/hex picker as an extra “Custom” option.
 */
export default function TeamColorPicker({
  value,
  ariaLabel,
  onChange,
  size = "sm",
}: Props) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const colorInputId = useId();
  const current = normalizeTeamColor(value);
  const [draftCustom, setDraftCustom] = useState(current);
  const swatch = size === "sm" ? 22 : 28;
  const inPalette = (TEAM_COLOR_PALETTE as readonly string[]).some(
    (c) => c.toUpperCase() === current.toUpperCase(),
  );

  useEffect(() => {
    if (isOpen) setDraftCustom(current);
  }, [isOpen, current]);

  return (
    <Popover
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      placement="bottom-start"
      isLazy
    >
      <PopoverTrigger>
        <Button
          variant="outline"
          size={size}
          px={2}
          aria-label={ariaLabel}
          title={current}
        >
          <HStack spacing={2}>
            <Box
              w={`${swatch}px`}
              h={`${swatch}px`}
              borderRadius="md"
              bg={current || DEFAULT_TEAM_COLOR}
              borderWidth="1px"
              borderColor="blackAlpha.300"
              flexShrink={0}
            />
            <Text
              fontSize="xs"
              fontFamily="mono"
              color="gray.600"
              display={{ base: "none", md: "block" }}
            >
              {current}
            </Text>
          </HStack>
        </Button>
      </PopoverTrigger>
      <PopoverContent w="240px" _focus={{ outline: "none" }}>
        <PopoverArrow />
        <PopoverBody>
          <VStack align="stretch" spacing={3}>
            <Text fontSize="xs" fontWeight="semibold" color="gray.600">
              Palette
            </Text>
            <SimpleGrid columns={5} spacing={2}>
              {TEAM_COLOR_PALETTE.map((c) => {
                const selected = c.toUpperCase() === current.toUpperCase();
                return (
                  <Box
                    as="button"
                    key={c}
                    type="button"
                    aria-label={`Select ${c}`}
                    aria-pressed={selected}
                    onClick={() => {
                      onChange(c);
                      onClose();
                    }}
                    w="32px"
                    h="32px"
                    borderRadius="md"
                    bg={c}
                    borderWidth={selected ? "2px" : "1px"}
                    borderColor={selected ? "blue.500" : "blackAlpha.300"}
                    boxShadow={selected ? "outline" : undefined}
                    cursor="pointer"
                    _hover={{ transform: "scale(1.06)" }}
                    transition="transform 0.1s ease"
                  />
                );
              })}
            </SimpleGrid>
            <Box borderTopWidth="1px" borderColor="gray.100" pt={2}>
              <Text fontSize="xs" fontWeight="semibold" color="gray.600" mb={2}>
                Custom RGB
              </Text>
              <HStack>
                <input
                  id={colorInputId}
                  type="color"
                  value={draftCustom}
                  onChange={(e) => {
                    const next = e.target.value.toUpperCase();
                    setDraftCustom(next);
                    onChange(next);
                  }}
                  style={{
                    width: 40,
                    height: 32,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 0,
                  }}
                  aria-label={`${ariaLabel} custom RGB`}
                />
                <Text fontSize="xs" fontFamily="mono" color="gray.500">
                  {inPalette ? "or pick any hex" : draftCustom}
                </Text>
              </HStack>
            </Box>
          </VStack>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
