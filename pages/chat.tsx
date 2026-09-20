import { GetServerSideProps } from "next";
import {
  Box,
  Button,
  Card,
  Flex,
  Icon,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { GiBubbles } from "react-icons/gi";
import NavContainer from "../components/NavContainer";
import { useSession } from "../components/useSession";
import { prisma } from "../lib/prisma";
import { requireUserSSP } from "../lib/auth";
import { serializeChatMessage } from "../lib/serialize";
import type { SerializedChatMessage } from "../lib/types";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const messages = await prisma.chatMessage.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    include: { team: true },
  });

  return {
    props: {
      initialMessages: messages.map(serializeChatMessage).reverse(),
    },
  };
};

export default function Page({
  initialMessages,
}: {
  initialMessages: SerializedChatMessage[];
}) {
  const session = useSession();
  const [messages, setMessages] =
    useState<SerializedChatMessage[]>(initialMessages);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const response = await fetch("/api/chat/messages");
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  };

  useEffect(() => {
    if (session == null) {
      return;
    }

    const interval = setInterval(() => {
      fetchMessages();
    }, 10000);

    return () => clearInterval(interval);
  }, [session]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSending) {
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: newMessage,
        }),
      });

      if (response.ok) {
        setNewMessage("");
        await fetchMessages();
      } else {
        console.error("Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (session == null) {
    return (
      <NavContainer title="Chat">
        <Text>Please sign in to use the chat.</Text>
      </NavContainer>
    );
  }

  return (
    <NavContainer title="Chat">
      <VStack spacing={3} alignItems="stretch" pb="0">
        {messages.length === 0 ? (
          <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            py={16}
            color="gray.400"
          >
            <Icon as={GiBubbles} boxSize={20} mb={4} opacity={0.5} />
            <Text fontSize="lg" fontWeight="medium">
              No messages yet. Start the conversation!
            </Text>
          </Flex>
        ) : (
          messages.map((msg, index) => (
            <Card
              key={`${msg.id}-${index}`}
              p={4}
              width="100%"
              bg={msg.isAdmin ? "blue.50" : "white"}
              borderColor={msg.isAdmin ? "blue.200" : "gray.200"}
              borderWidth="1px"
              boxShadow="sm"
              borderRadius="lg"
              transition="all 0.2s"
              _hover={{ boxShadow: "md" }}
            >
              <Flex direction="column" gap={2}>
                <Flex justifyContent="space-between" alignItems="center">
                  <Text
                    fontWeight="bold"
                    fontSize="sm"
                    color={msg.isAdmin ? "blue.700" : "gray.800"}
                  >
                    {msg.teamName}
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    {new Date(msg.createdAt).toLocaleString()}
                  </Text>
                </Flex>
                <Text fontSize="sm" color="gray.700" lineHeight="tall">
                  {msg.message}
                </Text>
              </Flex>
            </Card>
          ))
        )}
        <div ref={messagesEndRef} />
      </VStack>
      <Box
        position="fixed"
        bottom={{ base: 0, md: 4 }}
        left={{ base: 0, md: "20vw" }}
        right={0}
        width={{ base: "100vw", md: "80vw" }}
        bg="white"
        p={4}
        borderTop="1px solid"
        borderColor="gray.200"
        boxShadow="sm"
        zIndex={10}
      >
        <Flex gap={2}>
          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isSending}
            borderRadius="md"
            _focus={{
              borderColor: "blue.400",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-400)",
            }}
          />
          <Button
            onClick={handleSendMessage}
            isLoading={isSending}
            colorScheme="blue"
            borderRadius="md"
          >
            Send
          </Button>
        </Flex>
      </Box>
    </NavContainer>
  );
}
