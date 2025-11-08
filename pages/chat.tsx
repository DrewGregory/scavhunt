import { GetServerSideProps } from "next";
import { dbConnect } from "../lib/dbConnect";
import {
  Box,
  Button,
  Card,
  Flex,
  Icon,
  Input,
  Text,
  VStack,
  Badge,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { GiSpeechBubbles } from "react-icons/gi";
import { FaVideo } from "react-icons/fa";
import NavContainer from "../components/NavContainer";
import { useTeam } from "../components/useTeam";
import { getTeamFromCookie } from "../lib/team";
import { ChatModel, serializedChatSchema, SerializedChat } from "../models/Chat";
import { z } from "zod";

export const getServerSideProps: GetServerSideProps = async (context) => {
  await dbConnect();
  const team = await getTeamFromCookie(context.req.cookies);
  if (team == null) {
    return {
      props: {
        initialMessages: [],
      },
    };
  }

  const messages = await ChatModel.find({})
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()
    .exec();

  const serializedMessages = messages
    .map((msg) => {
      const parsed = serializedChatSchema.safeParse(msg);
      return parsed.success ? parsed.data : null;
    })
    .filter((msg): msg is SerializedChat => msg !== null)
    .reverse();

  return {
    props: {
      initialMessages: serializedMessages,
    },
  };
};

export default function Page({
  initialMessages,
}: {
  initialMessages: SerializedChat[];
}) {
  const team = useTeam();
  const [messages, setMessages] = useState<SerializedChat[]>(initialMessages);
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
    if (team == null) {
      return;
    }

    const interval = setInterval(() => {
      fetchMessages();
    }, 10000);

    return () => clearInterval(interval);
  }, [team]);

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

  if (team == null) {
    return (
      <NavContainer title="Chat">
        <Text>Please sign in to use the chat.</Text>
      </NavContainer>
    );
  }

  return (
    <NavContainer title="Chat">
      <VStack spacing={2} alignItems="stretch" pb="0">
        {messages.length === 0 ? (
          <Flex direction="column" alignItems="center" justifyContent="center" py={10} color="gray.400">
            <Icon as={GiSpeechBubbles} boxSize={20} mb={4} />
            <Text fontSize="lg">No messages yet. Start the conversation!</Text>
          </Flex>
        ) : (
          messages.map((msg, index) => (
            <Card key={`${msg._id}-${index}`} p={3} width="100%">
              <Flex direction="column">
                <Flex justifyContent="space-between" alignItems="center" mb={1}>
                  <Flex alignItems="center" gap={2}>
                    <Text fontWeight="bold" fontSize="sm">
                      {msg.teamName}
                    </Text>
                    {msg.threadId && (
                      <Badge colorScheme="purple" display="flex" alignItems="center" p={1}>
                        <Icon as={FaVideo} boxSize={3} />
                      </Badge>
                    )}
                  </Flex>
                  <Text fontSize="xs" color="gray.500">
                    {new Date(msg.createdAt).toLocaleString()}
                  </Text>
                </Flex>
                <Text fontSize="sm">{msg.message}</Text>
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
        zIndex={10}
      >
        <Flex gap={2}>
          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isSending}
          />
          <Button
            onClick={handleSendMessage}
            isLoading={isSending}
            colorScheme="blue"
          >
            Send
          </Button>
        </Flex>
      </Box>
    </NavContainer>
  );
}
