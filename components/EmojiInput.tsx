import { Input, type InputProps } from "@chakra-ui/react";

/**
 * Narrow emoji field — same pattern as team / neighborhood emoji inputs.
 * Paste an emoji or use the OS emoji picker (e.g. Ctrl/Cmd-Cmd-Space).
 */
export default function EmojiInput({
  value,
  onChange,
  placeholder = "🎯",
  ...rest
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
} & Omit<InputProps, "value" | "onChange" | "placeholder">) {
  return (
    <Input
      size="sm"
      maxW="56px"
      textAlign="center"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Emoji"
      {...rest}
    />
  );
}
