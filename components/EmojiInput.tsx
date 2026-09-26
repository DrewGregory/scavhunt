import {
  Box,
  Button,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import dynamic from "next/dynamic";
import type { EmojiClickData } from "emoji-picker-react";
import { firstEmoji } from "../lib/emoji";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

/**
 * Single-emoji picker for admin UIs (full Unicode set via emoji-picker-react).
 */
export default function EmojiInput({
  value,
  onChange,
  placeholder = "🎯",
  size = "sm",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  size?: "xs" | "sm" | "md";
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const display = firstEmoji(value) ?? "";

  const setEmoji = (next: string) => {
    const one = firstEmoji(next);
    onChange(one ?? "");
    onClose();
  };

  return (
    <Popover
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      placement="bottom-start"
      isLazy
      strategy="fixed"
    >
      <PopoverTrigger>
        <Button
          size={size}
          variant="outline"
          minW={size === "xs" ? "36px" : "44px"}
          px={1}
          fontSize={size === "xs" ? "md" : "lg"}
          aria-label={display ? `Emoji ${display}` : "Pick emoji"}
          title="Pick emoji"
        >
          {display || (
            <Text as="span" opacity={0.45} fontSize="sm">
              {placeholder}
            </Text>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        w="auto"
        maxW="calc(100vw - 24px)"
        zIndex={2000}
        p={0}
        border="none"
        boxShadow="lg"
        overflow="hidden"
      >
        <PopoverBody p={0}>
          {isOpen && (
            <Box>
              <EmojiPicker
                onEmojiClick={(data: EmojiClickData) => setEmoji(data.emoji)}
                width={320}
                height={360}
                previewConfig={{ showPreview: false }}
                skinTonesDisabled
              />
              <Box px={2} pb={2} bg="white">
                <Button
                  size="xs"
                  variant="ghost"
                  w="100%"
                  isDisabled={!display}
                  onClick={() => {
                    onChange("");
                    onClose();
                  }}
                >
                  Clear
                </Button>
              </Box>
            </Box>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
