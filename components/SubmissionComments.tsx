import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Flex,
  HStack,
  Spinner,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { formatDistance } from "date-fns";
import AdminBadge from "./AdminBadge";
import type { SerializedSubmissionComment } from "../lib/types";

export default function SubmissionComments({
  submissionId,
  enabled,
}: {
  submissionId: string;
  /** Fetch and show thread when the submission row is expanded. */
  enabled: boolean;
}) {
  const [comments, setComments] = useState<SerializedSubmissionComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/submissions/${encodeURIComponent(submissionId)}/comments`,
        { credentials: "same-origin" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Could not load comments");
      }
      const data = (await res.json()) as {
        comments: SerializedSubmissionComment[];
      };
      setComments(data.comments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load comments");
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  async function postComment() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/submissions/${encodeURIComponent(submissionId)}/comments`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Could not post comment");
      }
      const data = (await res.json()) as {
        comment: SerializedSubmissionComment;
      };
      setComments((prev) => [...prev, data.comment]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post comment");
    } finally {
      setPosting(false);
    }
  }

  if (!enabled) return null;

  return (
    <Box pt={1}>
      <Text
        fontSize="xs"
        fontWeight="semibold"
        color="gray.500"
        textTransform="uppercase"
        letterSpacing="wide"
        mb={2}
      >
        Comments{comments.length > 0 ? ` (${comments.length})` : ""}
      </Text>

      {loading && comments.length === 0 ? (
        <FlexSpinner />
      ) : (
        <VStack align="stretch" spacing={3} mb={3}>
          {comments.length === 0 && !loading ? (
            <Text fontSize="sm" color="gray.500">
              No comments yet — say something!
            </Text>
          ) : null}
          {comments.map((c) => (
            <Box
              key={c.id}
              bg="white"
              borderRadius="md"
              px={3}
              py={2}
              borderWidth="1px"
              borderColor="gray.100"
            >
              <HStack justify="space-between" align="flex-start" gap={2}>
                <Flex align="center" gap={2} flexWrap="wrap" minW={0}>
                  <Text fontSize="sm" fontWeight="semibold" color="gray.800">
                    {c.user.team ? `${c.user.team.emoji} ` : ""}
                    {c.user.name}
                  </Text>
                  {c.user.isAdmin ? <AdminBadge /> : null}
                </Flex>
                <Text fontSize="xs" color="gray.400" whiteSpace="nowrap">
                  {formatDistance(new Date(c.createdAt), new Date(), {
                    addSuffix: true,
                  })}
                </Text>
              </HStack>
              <Text fontSize="sm" color="gray.700" mt={1} whiteSpace="pre-wrap">
                {c.body}
              </Text>
            </Box>
          ))}
        </VStack>
      )}

      {error ? (
        <Text fontSize="sm" color="red.500" mb={2}>
          {error}
        </Text>
      ) : null}

      <VStack align="stretch" spacing={2}>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          size="sm"
          rows={2}
          resize="vertical"
          bg="white"
          isDisabled={posting}
        />
        <HStack justify="flex-end">
          <Button
            size="sm"
            colorScheme="blue"
            isLoading={posting}
            isDisabled={!draft.trim()}
            onClick={() => void postComment()}
          >
            Post
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
}

function FlexSpinner() {
  return (
    <HStack justify="center" py={3}>
      <Spinner size="sm" color="gray.400" />
    </HStack>
  );
}
