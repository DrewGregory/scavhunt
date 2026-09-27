import { Box, type BoxProps } from "@chakra-ui/react";
import ReactMarkdown from "react-markdown";

/** Shared markdown renderer for announcement bodies. */
export function MarkdownBody({
  children,
  ...boxProps
}: { children: string } & BoxProps) {
  return (
    <Box
      className="markdown-body"
      fontSize="md"
      lineHeight="tall"
      color="gray.800"
      sx={{
        "& p": { mb: 3 },
        "& p:last-child": { mb: 0 },
        "& ul, & ol": { pl: 5, mb: 3 },
        "& li": { mb: 1 },
        "& h1, & h2, & h3": {
          fontWeight: "bold",
          lineHeight: "short",
          mt: 4,
          mb: 2,
        },
        "& h1": { fontSize: "xl" },
        "& h2": { fontSize: "lg" },
        "& h3": { fontSize: "md" },
        "& a": { color: "blue.600", textDecoration: "underline" },
        "& code": {
          bg: "gray.100",
          px: 1,
          borderRadius: "sm",
          fontSize: "0.9em",
        },
        "& pre": {
          bg: "gray.100",
          p: 3,
          borderRadius: "md",
          overflowX: "auto",
          mb: 3,
        },
        "& pre code": { bg: "transparent", p: 0 },
        "& blockquote": {
          borderLeft: "3px solid",
          borderColor: "gray.300",
          pl: 3,
          color: "gray.600",
          mb: 3,
        },
        "& strong": { fontWeight: "semibold" },
        "& hr": { my: 4, borderColor: "gray.200" },
      }}
      {...boxProps}
    >
      <ReactMarkdown
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {linkChildren}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </Box>
  );
}
