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
  type ResponsiveValue,
} from "@chakra-ui/react";
import type { ReactNode } from "react";
import { MarkdownBody } from "./MarkdownBody";

/**
 * Player-facing announcement chrome (title + scrollable markdown body + footer).
 * Used for the real blocking modal and the admin “Preview and send” confirm step.
 */
export function AnnouncementPlayerShell({
  isOpen,
  title,
  body,
  eyebrow = "Announcement",
  footer,
  onClose,
  closeOnOverlayClick = false,
  closeOnEsc = false,
}: {
  isOpen: boolean;
  title: string;
  body: string;
  eyebrow?: string;
  footer: ReactNode;
  onClose?: () => void;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose ?? (() => undefined)}
      closeOnOverlayClick={closeOnOverlayClick}
      closeOnEsc={closeOnEsc}
      isCentered
      size={{ base: "full", sm: "md", md: "lg" }}
      scrollBehavior="inside"
      blockScrollOnMount
    >
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent
        mx={{ base: 0, sm: 4 }}
        my={{ base: 0, sm: 4 }}
        maxH={{ base: "100dvh", sm: "90dvh" }}
        h={{ base: "100dvh", sm: "auto" }}
        borderRadius={{ base: 0, sm: "md" }}
        display="flex"
        flexDirection="column"
        overflow="hidden"
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
              {eyebrow}
            </Text>
            <Heading size="md" lineHeight="short">
              {title}
            </Heading>
          </VStack>
        </ModalHeader>
        <ModalBody
          flex="1"
          minH={0}
          overflowY="auto"
          overscrollBehavior="contain"
          pb={2}
        >
          <MarkdownBody>{body}</MarkdownBody>
        </ModalBody>
        <ModalFooter
          flexShrink={0}
          borderTopWidth="1px"
          borderColor="gray.100"
          px={{ base: 4, sm: 6 }}
          py={4}
          pb={{ base: "max(1rem, env(safe-area-inset-bottom))", sm: 4 }}
          gap={2}
          flexWrap="wrap"
        >
          {footer}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/** Convenience footer button matching the player “Got it” CTA. */
export function AnnouncementGotItButton({
  onClick,
  isLoading,
  children = "Got it",
  flex,
}: {
  onClick: () => void;
  isLoading?: boolean;
  children?: ReactNode;
  flex?: ResponsiveValue<string | number>;
}) {
  return (
    <Button
      colorScheme="blue"
      w={flex ? undefined : "100%"}
      flex={flex}
      size="lg"
      onClick={onClick}
      isLoading={isLoading}
    >
      {children}
    </Button>
  );
}
