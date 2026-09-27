"use client";

import {
  Box,
  Button,
  Heading,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MarkdownBody } from "./MarkdownBody";

export type AnnouncementContent = {
  id: string;
  title: string;
  body: string;
  publishedAt?: string | null;
  pinned?: boolean;
};

/** Voluntary read-more modal (banner / sidebar). Closable. */
export function AnnouncementDetailModal({
  announcement,
  onClose,
}: {
  announcement: AnnouncementContent | null;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={!!announcement}
      onClose={onClose}
      isCentered
      size={{ base: "full", sm: "md", md: "lg" }}
      scrollBehavior="inside"
    >
      <ModalOverlay />
      <ModalContent
        mx={{ base: 0, sm: 4 }}
        my={{ base: 0, sm: 4 }}
        maxH={{ base: "100dvh", sm: "90dvh" }}
        borderRadius={{ base: 0, sm: "md" }}
        display="flex"
        flexDirection="column"
      >
        <ModalHeader pb={2} pr={12} flexShrink={0}>
          <VStack align="stretch" spacing={1}>
            <Text
              fontSize="xs"
              fontWeight="semibold"
              textTransform="uppercase"
              letterSpacing="0.06em"
              color="blue.600"
            >
              Announcement
              {announcement?.pinned ? " · Pinned" : ""}
            </Text>
            <Heading size="md" lineHeight="short">
              {announcement?.title}
            </Heading>
            {announcement?.publishedAt && (
              <Text fontSize="xs" color="gray.500" fontWeight="normal">
                {new Date(announcement.publishedAt).toLocaleString()}
              </Text>
            )}
          </VStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody flex="1" minH={0} overflowY="auto" pb={2}>
          {announcement && <MarkdownBody>{announcement.body}</MarkdownBody>}
        </ModalBody>
        <ModalFooter
          flexShrink={0}
          borderTopWidth="1px"
          borderColor="gray.100"
          pb={{ base: "max(1rem, env(safe-area-inset-bottom))", sm: 4 }}
        >
          <Button w="100%" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
