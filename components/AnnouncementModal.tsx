"use client";

import {
  Button,
  Heading,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "./useSession";
import { MarkdownBody } from "./MarkdownBody";

type PendingAnnouncement = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
};

/**
 * Blocking announcement queue for logged-in players.
 * Shows one at a time; dismissing records server-side and advances to the next.
 */
export function AnnouncementModal() {
  const session = useSession();
  const [queue, setQueue] = useState<PendingAnnouncement[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setQueue([]);
      setLoaded(true);
      return;
    }
    try {
      const res = await fetch("/api/announcements/pending");
      if (!res.ok) return;
      const data = await res.json();
      setQueue((data.announcements ?? []) as PendingAnnouncement[]);
    } catch {
      /* don't block the app on fetch failure */
    } finally {
      setLoaded(true);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = queue[0] ?? null;
  const remaining = Math.max(0, queue.length - 1);

  const dismiss = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/announcements/${current.id}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) return;
      setQueue((prev) => prev.filter((a) => a.id !== current.id));
    } finally {
      setBusy(false);
    }
  };

  if (!session?.user || !loaded || !current) return null;

  return (
    <Modal
      isOpen
      onClose={() => {
        /* must dismiss via button */
      }}
      closeOnOverlayClick={false}
      closeOnEsc={false}
      isCentered
      size={{ base: "full", sm: "md", md: "lg" }}
      scrollBehavior="inside"
    >
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent
        mx={{ base: 0, sm: 4 }}
        my={{ base: 0, sm: 4 }}
        maxH={{ base: "100dvh", sm: "90dvh" }}
        borderRadius={{ base: 0, sm: "md" }}
        display="flex"
        flexDirection="column"
      >
        <ModalHeader pb={2} flexShrink={0}>
          <VStack align="stretch" spacing={1}>
            <Text
              fontSize="xs"
              fontWeight="semibold"
              textTransform="uppercase"
              letterSpacing="0.06em"
              color="blue.600"
            >
              Announcement
              {remaining > 0 ? ` · ${remaining} more after this` : ""}
            </Text>
            <Heading size="md" lineHeight="short">
              {current.title}
            </Heading>
          </VStack>
        </ModalHeader>
        <ModalBody flex="1" minH={0} overflowY="auto" pb={2}>
          <MarkdownBody>{current.body}</MarkdownBody>
        </ModalBody>
        <ModalFooter
          flexShrink={0}
          borderTopWidth="1px"
          borderColor="gray.100"
          px={{ base: 4, sm: 6 }}
          py={4}
          pb={{ base: "max(1rem, env(safe-area-inset-bottom))", sm: 4 }}
        >
          <Button
            colorScheme="blue"
            w="100%"
            size="lg"
            onClick={() => void dismiss()}
            isLoading={busy}
          >
            Got it
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
