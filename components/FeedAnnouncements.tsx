"use client";

import {
  Badge,
  Box,
  Flex,
  Heading,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useState } from "react";
import {
  AnnouncementDetailModal,
  type AnnouncementContent,
} from "./AnnouncementDetailModal";

export type FeedAnnouncement = AnnouncementContent & {
  publishedAt: string | null;
  pinned: boolean;
};

/** Layout: pinned banners on top; announcements list beside feed on desktop. */
export function FeedWithAnnouncements({
  announcements,
  children,
}: {
  announcements: FeedAnnouncement[];
  children: React.ReactNode;
}) {
  const pinned = announcements.filter((a) => a.pinned);

  return (
    <VStack align="stretch" spacing={4} width="100%">
      {pinned.length > 0 && <PinnedBanners items={pinned} />}
      <Flex
        direction={{ base: "column", md: "row" }}
        gap={{ base: 3, md: 4 }}
        align="flex-start"
        width="100%"
      >
        <Box flex="1" minW={0} width="100%" order={{ base: 2, md: 1 }}>
          {children}
        </Box>
        <Box
          width={{ base: "100%", md: "240px", lg: "260px" }}
          flexShrink={0}
          position={{ md: "sticky" }}
          top={{ md: 0 }}
          alignSelf="flex-start"
          order={{ base: 1, md: 2 }}
          zIndex={1}
        >
          <AnnouncementsSidebar announcements={announcements} />
        </Box>
      </Flex>
    </VStack>
  );
}

function PinnedBanners({ items }: { items: FeedAnnouncement[] }) {
  const [selected, setSelected] = useState<FeedAnnouncement | null>(null);
  return (
    <>
      <VStack align="stretch" spacing={2} width="100%">
        {items.map((a) => (
          <Box
            key={a.id}
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
            onClick={() => setSelected(a)}
          >
            <HStack justify="space-between" align="center" gap={3}>
              <Text fontWeight="semibold" fontSize="sm" noOfLines={2}>
                {a.title}
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
        ))}
      </VStack>
      <AnnouncementDetailModal
        announcement={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

function AnnouncementsSidebar({
  announcements,
}: {
  announcements: FeedAnnouncement[];
}) {
  const [selected, setSelected] = useState<FeedAnnouncement | null>(null);
  return (
    <>
      <Box
        bg="white"
        borderRadius="md"
        boxShadow="sm"
        borderWidth="1px"
        borderColor="gray.200"
        overflow="hidden"
        width="100%"
      >
        <Box px={3} py={2} borderBottomWidth="1px" borderColor="gray.100">
          <Heading size="xs" color="gray.700">
            Announcements
          </Heading>
        </Box>
        {announcements.length === 0 ? (
          <Text px={3} py={3} fontSize="sm" color="gray.400">
            None yet
          </Text>
        ) : (
          <VStack
            align="stretch"
            spacing={0}
            maxH={{ base: "180px", md: "70vh" }}
            overflowY="auto"
          >
            {announcements.map((a) => (
              <Box
                key={a.id}
                as="button"
                textAlign="left"
                px={3}
                py={2.5}
                borderBottomWidth="1px"
                borderColor="gray.50"
                _hover={{ bg: "blue.50" }}
                _active={{ bg: "blue.100" }}
                onClick={() => setSelected(a)}
              >
                <Flex align="flex-start" gap={2}>
                  {a.pinned && (
                    <Badge colorScheme="blue" flexShrink={0} mt={0.5}>
                      Pin
                    </Badge>
                  )}
                  <Box minW={0} flex={1}>
                    <Text fontSize="sm" fontWeight="medium" noOfLines={2}>
                      {a.title}
                    </Text>
                    {a.publishedAt && (
                      <Text fontSize="2xs" color="gray.500" mt={0.5}>
                        {new Date(a.publishedAt).toLocaleDateString()}
                      </Text>
                    )}
                  </Box>
                </Flex>
              </Box>
            ))}
          </VStack>
        )}
      </Box>
      <AnnouncementDetailModal
        announcement={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
