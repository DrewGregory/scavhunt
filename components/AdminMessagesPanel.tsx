import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { formatDistance } from "date-fns";
import { formatPhoneDisplay } from "../lib/phone";

type MessageRow = {
  id: string;
  body: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    phoneE164: string;
    team: { id: string; name: string; emoji: string } | null;
  };
};

export default function AdminMessagesPanel({
  onNotice,
}: {
  onNotice: (type: "success" | "error", message: string) => void;
}) {
  const [rows, setRows] = useState<MessageRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/messages");
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      setRows((data.messages ?? []) as MessageRow[]);
    } catch {
      onNotice("error", "Failed to load user feedback");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && rows == null) {
    return <Text color="gray.500">Loading…</Text>;
  }

  return (
    <VStack align="stretch" spacing={4}>
      <Text fontWeight="semibold">User Feedback</Text>

      {!rows?.length ? (
        <Text color="gray.500">No messages yet.</Text>
      ) : (
        <VStack align="stretch" spacing={3}>
          {rows.map((m) => (
            <Box
              key={m.id}
              bg="white"
              p={4}
              borderRadius="md"
              boxShadow="sm"
              border="1px"
              borderColor="gray.100"
            >
              <HStack
                justify="space-between"
                align="flex-start"
                mb={2}
                flexWrap="wrap"
                gap={2}
              >
                <Box minW={0}>
                  <Text fontWeight="semibold" noOfLines={1}>
                    {m.user.name}
                    {m.user.team
                      ? ` · ${m.user.team.emoji} ${m.user.team.name}`
                      : ""}
                  </Text>
                  <Text fontSize="xs" color="gray.500" noOfLines={1}>
                    {formatPhoneDisplay(m.user.phoneE164)}
                  </Text>
                </Box>
                <Text fontSize="xs" color="gray.500" flexShrink={0}>
                  {formatDistance(new Date(m.createdAt), new Date(), {
                    addSuffix: true,
                  })}
                </Text>
              </HStack>
              <Text fontSize="sm" whiteSpace="pre-wrap" color="gray.800">
                {m.body}
              </Text>
            </Box>
          ))}
        </VStack>
      )}
    </VStack>
  );
}
