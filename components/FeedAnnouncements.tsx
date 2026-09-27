"use client";

import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import {
  AnnouncementGotItButton,
  AnnouncementPlayerShell,
} from "./AnnouncementPlayerShell";

export type FeedAnnouncement = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  pinned: boolean;
};

/** Optional single pinned banner above the feed. Nothing renders if none is pinned. */
export function FeedWithAnnouncements({
  pinned,
  children,
}: {
  pinned: FeedAnnouncement | null;
  children: React.ReactNode;
}) {
  return (
    <VStack align="stretch" spacing={4} width="100%">
      {pinned ? <PinnedBanner item={pinned} /> : null}
      <Box width="100%">{children}</Box>
    </VStack>
  );
}

function PinnedBanner({ item }: { item: FeedAnnouncement }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Box
        as="button"
        textAlign="left"
        width="100%"
        bg="blue.600"
        color="white"
        px={4}
        py={3}
        borderRadius="md"
        boxShadow="sm"
        _hover={{ bg: "blue.700" }}
        _active={{ bg: "blue.800" }}
        onClick={() => setOpen(true)}
      >
        <HStack justify="space-between" align="center" gap={3}>
          <Text fontWeight="semibold" fontSize="sm" noOfLines={2}>
            {item.title}
          </Text>
          <Text
            fontSize="xs"
            fontWeight="bold"
            textTransform="uppercase"
            letterSpacing="0.04em"
            flexShrink={0}
            opacity={0.9}
          >
            Read more
          </Text>
        </HStack>
      </Box>
      {open && (
        <AnnouncementPlayerShell
          isOpen
          title={item.title}
          body={item.body}
          closeOnOverlayClick
          closeOnEsc
          onClose={() => setOpen(false)}
          footer={
            <AnnouncementGotItButton onClick={() => setOpen(false)} />
          }
        />
      )}
    </>
  );
}
